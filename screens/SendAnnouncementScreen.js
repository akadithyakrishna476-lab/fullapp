import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { addDoc, arrayUnion, collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth, db } from '../firebase/firebaseConfig';
import { fetchUserRole } from '../utils/authHelpers';

const normalizeRole = (value) => (value || '').toString().toLowerCase();

const formatDateTime = (timestamp) => {
  if (!timestamp) return '—';
  const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
  if (!date || Number.isNaN(date.getTime())) return '—';

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const strTime = `${hours}:${minutes} ${ampm}`;

  return `${day}/${month}/${year} ${strTime}`;
};

const YEARS = [
  { id: 'all', label: 'All Years' },
  { id: 'year1', label: 'Year 1' },
  { id: 'year2', label: 'Year 2' },
  { id: 'year3', label: 'Year 3' },
  { id: 'year4', label: 'Year 4' },
];

const SendAnnouncementScreen = () => {
  const router = useRouter();
  const params = useLocalSearchParams();
  const readOnlyParam = normalizeRole(params?.mode) === 'view' || String(params?.readOnly || '').toLowerCase() === 'true';

  const [announcements, setAnnouncements] = useState([]);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState(readOnlyParam ? 'sent' : 'compose');
  const [userRole, setUserRole] = useState(null);
  const [displayName, setDisplayName] = useState('Faculty');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [selectedYear, setSelectedYear] = useState('all');
  const [crYear, setCrYear] = useState(null);

  const canCompose = !readOnlyParam && normalizeRole(userRole) === 'faculty';

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setLoading(false);
      return;
    }

    const loadProfile = async () => {
      try {
        const { role } = await fetchUserRole(user.uid, user.email);
        setUserRole(role);

        let name = user.displayName || (user.email ? user.email.split('@')[0] : 'Faculty');
        try {
          const facultyDoc = await getDoc(doc(db, 'faculty', user.uid));
          if (facultyDoc.exists()) {
            const data = facultyDoc.data();
            name = data.name || name;
          }
        } catch (e) {
          console.warn('Could not load faculty profile name', e.message);
        }
        setDisplayName(name);

        // Load CR year if applicable
        if (role === 'class_representative' || role === 'representative' || role === 'cr') {
          const storedCRData = await AsyncStorage.getItem('crData');
          if (storedCRData) {
            const data = JSON.parse(storedCRData);
            setCrYear(data.year);
          }
        }
      } catch (error) {
        console.error('Failed to load user role/profile', error);
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, []);

  useEffect(() => {
    const announcementsQuery = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(announcementsQuery, (snapshot) => {
      const items = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      setAnnouncements(items);
    });

    return () => unsubscribe();
  }, []);

  const visibleAnnouncements = useMemo(() => {
    const role = normalizeRole(userRole);
    return announcements.filter((item) => {
      // Deletion check
      const roleNormalized = role;
      if (roleNormalized === 'faculty') {
        if (item.facultyDeleted) return false;
      } else if (roleNormalized === 'class_representative' || roleNormalized === 'representative' || roleNormalized === 'cr') {
        if (item.deletedByUids && Array.isArray(item.deletedByUids) && item.deletedByUids.includes(auth.currentUser?.uid)) {
          return false;
        }
      }

      if (role === 'faculty') return true;
      if (role === 'class_representative' || role === 'representative' || role === 'cr') {
        const isBasicVisible = item.allowRepView !== false;
        if (!isBasicVisible) return false;

        // Year filtering
        if (!item.targetYear || item.targetYear === 'all') return true;
        return item.targetYear === crYear;
      }
      return false;
    });
  }, [announcements, userRole, crYear]);

  const handleSendAnnouncement = async () => {
    if (!canCompose) {
      Alert.alert('Access restricted', 'Only faculty can create announcements.');
      return;
    }

    if (!message.trim()) {
      Alert.alert('Missing message', 'Please add an announcement message before sending.');
      return;
    }

    setSending(true);

    try {
      const user = auth.currentUser;
      if (!user) {
        Alert.alert('Not signed in', 'Please sign in again to send announcements.');
        return;
      }
      const payload = {
        title: title.trim() || 'Announcement',
        message: message.trim(),
        facultyUid: user?.uid || null,
        facultyName: displayName,
        facultyEmail: user?.email || '',
        createdAt: serverTimestamp(),
        targetRole: 'rep',
        allowRepView: true,
        targetYear: selectedYear,
      };

      const announcementRef = await addDoc(collection(db, 'announcements'), payload);

      await addDoc(collection(db, 'notifications'), {
        title: payload.title,
        body: payload.message.slice(0, 140),
        recipient: 'all',
        recipientRole: 'rep',
        type: 'announcement',
        announcementId: announcementRef.id,
        read: false,
        timestamp: serverTimestamp(),
        targetYear: selectedYear,
      });

      setMessage('');
      setTitle('');
      setActiveTab('sent');
      Alert.alert('Announcement sent', 'Class representatives will be notified.');
    } catch (error) {
      console.error('Failed to send announcement', error);
      Alert.alert('Error', 'Could not send the announcement. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleDeleteAnnouncement = async (id) => {
    Alert.alert(
      'Delete Announcement',
      'Are you sure you want to delete this announcement from your history?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const docRef = doc(db, 'announcements', id);
              const roleNormalized = normalizeRole(userRole);

              if (roleNormalized === 'faculty') {
                await updateDoc(docRef, { facultyDeleted: true });
              } else {
                await updateDoc(docRef, {
                  deletedByUids: arrayUnion(auth.currentUser.uid)
                });
              }
            } catch (error) {
              console.error('Failed to delete announcement', error);
              Alert.alert('Error', 'Could not delete announcement.');
            }
          },
        },
      ]
    );
  };

  const handleDeleteAllSorted = async () => {
    if (visibleAnnouncements.length === 0) return;

    Alert.alert(
      'Delete All',
      'Are you sure you want to clear your entire announcement history?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              const batch = writeBatch(db);
              const roleNormalized = normalizeRole(userRole);
              const uid = auth.currentUser.uid;

              visibleAnnouncements.forEach((item) => {
                const docRef = doc(db, 'announcements', item.id);
                if (roleNormalized === 'faculty') {
                  batch.update(docRef, { facultyDeleted: true });
                } else {
                  batch.update(docRef, {
                    deletedByUids: arrayUnion(uid)
                  });
                }
              });

              await batch.commit();
              Alert.alert('Success', 'History cleared.');
            } catch (error) {
              console.error('Failed to delete all', error);
              Alert.alert('Error', 'Could not clear history.');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const renderAnnouncementItem = ({ item }) => (
    <View style={styles.announcementCard}>
      <View style={styles.announcementHeader}>
        <View style={styles.announcementTitleSection}>
          <View style={styles.megaIcon}>
            <Ionicons name="megaphone" size={16} color="#f39c12" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.announcementTitle}>{item.title || 'Announcement'}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
              <Text style={styles.metaText}>
                {item.facultyName || 'Faculty'} • {formatDateTime(item.createdAt)}
              </Text>
              {normalizeRole(userRole) === 'faculty' && (
                <View style={styles.targetYearBadge}>
                  <Text style={styles.targetYearBadgeText}>
                    {YEARS.find(y => y.id === item.targetYear)?.label || 'All Years'}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => handleDeleteAnnouncement(item.id)}
          style={styles.deleteIconButton}
        >
          <Ionicons name="trash-outline" size={18} color="#e74c3c" />
        </TouchableOpacity>
      </View>
      <Text style={styles.announcementMessage}>{item.message}</Text>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#f39c12" />
          <Text style={styles.loadingText}>Loading announcements…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const hasAnnouncements = visibleAnnouncements.length > 0;
  const showCompose = canCompose;
  const showSentTab = true;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={24} color="#2c3e50" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Announcements</Text>
        <View style={{ width: 24 }} />
      </View>

      {showCompose && (
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'compose' && styles.tabActive]}
            onPress={() => setActiveTab('compose')}
          >
            <Ionicons name="create" size={16} color={activeTab === 'compose' ? '#f39c12' : '#7f8c8d'} />
            <Text style={[styles.tabText, activeTab === 'compose' && styles.tabTextActive]}>Compose</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'sent' && styles.tabActive]}
            onPress={() => setActiveTab('sent')}
          >
            <Ionicons name="mail" size={16} color={activeTab === 'sent' ? '#f39c12' : '#7f8c8d'} />
            <Text style={[styles.tabText, activeTab === 'sent' && styles.tabTextActive]}>
              Sent ({visibleAnnouncements.length})
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {!showCompose && (
        <View style={styles.readOnlyBanner}>
          <Ionicons name="lock-closed" size={16} color="#f39c12" style={{ marginRight: 8 }} />
          <Text style={styles.readOnlyText}>Viewing announcement history</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {activeTab === 'compose' && showCompose ? (
          <View style={styles.composeSection}>
            <Text style={styles.label}>Announcement Title (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Class rescheduled, Assignment update"
              value={title}
              onChangeText={setTitle}
              placeholderTextColor="#bdc3c7"
              editable={!sending}
            />

            <Text style={styles.label}>Target Academic Year</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 16 }}
            >
              {YEARS.map(year => (
                <TouchableOpacity
                  key={year.id}
                  style={[
                    styles.yearPill,
                    selectedYear === year.id && styles.yearPillActive
                  ]}
                  onPress={() => setSelectedYear(year.id)}
                  disabled={sending}
                >
                  <Text style={[
                    styles.yearPillText,
                    selectedYear === year.id && styles.yearPillTextActive
                  ]}>
                    {year.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.label}>Message</Text>
            <TextInput
              style={[styles.input, styles.messageInput]}
              placeholder="Type your announcement message..."
              value={message}
              onChangeText={setMessage}
              placeholderTextColor="#bdc3c7"
              multiline
              numberOfLines={6}
              textAlignVertical="top"
              editable={!sending}
            />

            <TouchableOpacity
              style={[styles.sendButton, sending && styles.sendButtonDisabled]}
              onPress={handleSendAnnouncement}
              disabled={sending}
            >
              <Ionicons name="send" size={16} color="#ffffff" />
              <Text style={styles.sendButtonText}>
                {sending ? 'Sending…' : 'Send to Class Representative'}
              </Text>
            </TouchableOpacity>

            <View style={styles.infoBox}>
              <Ionicons name="bulb" size={16} color="#f39c12" />
              <Text style={styles.infoText}>
                Announcements are delivered to class representatives and kept in history for future reference.
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.sentSection}>
            {hasAnnouncements ? (
              <FlatList
                data={visibleAnnouncements}
                renderItem={renderAnnouncementItem}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
              />
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="mail-open" size={48} color="#bdc3c7" />
                <Text style={styles.emptyStateText}>No announcements yet</Text>
              </View>
            )}
            {hasAnnouncements && (
              <TouchableOpacity
                style={styles.deleteAllButton}
                onPress={handleDeleteAllSorted}
              >
                <Ionicons name="trash-outline" size={14} color="#e74c3c" />
                <Text style={styles.deleteAllText}>Clear All History</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    backgroundColor: '#ffffff',
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#ecf0f1',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2c3e50',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#ecf0f1',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    marginHorizontal: 4,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#f39c12',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#7f8c8d',
    marginLeft: 4,
  },
  tabTextActive: {
    color: '#f39c12',
  },
  readOnlyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff6e5',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ecf0f1',
  },
  readOnlyText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#b36b00',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  composeSection: {
    marginBottom: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2c3e50',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ecf0f1',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 14,
    fontSize: 13,
    color: '#2c3e50',
  },
  messageInput: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  sendButton: {
    backgroundColor: '#f39c12',
    borderRadius: 8,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  sendButtonDisabled: {
    opacity: 0.7,
  },
  sendButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
    marginLeft: 6,
  },
  infoBox: {
    backgroundColor: '#fffbf0',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 3,
    borderLeftColor: '#f39c12',
  },
  infoText: {
    fontSize: 11,
    color: '#2c3e50',
    marginLeft: 8,
    flex: 1,
  },
  sentSection: {
    marginBottom: 20,
  },
  announcementCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#ecf0f1',
  },
  announcementHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  announcementTitleSection: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  megaIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fff6e5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  announcementTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2c3e50',
  },
  announcementMessage: {
    fontSize: 12,
    color: '#4a5568',
    marginBottom: 4,
    lineHeight: 18,
  },
  metaText: {
    fontSize: 11,
    color: '#7f8c8d',
    marginTop: 2,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#bdc3c7',
    marginTop: 12,
  },
  loaderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 10,
    color: '#7f8c8d',
    fontSize: 13,
  },
  deleteIconButton: {
    padding: 6,
    marginLeft: 8,
  },
  deleteAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e74c3c',
    borderRadius: 8,
    borderStyle: 'dashed',
    marginBottom: 20,
  },
  deleteAllText: {
    color: '#e74c3c',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
  },
  yearPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ecf0f1',
    marginRight: 8,
  },
  yearPillActive: {
    backgroundColor: '#fff6e5',
    borderColor: '#f39c12',
  },
  yearPillText: {
    fontSize: 12,
    color: '#7f8c8d',
    fontWeight: '600',
  },
  yearPillTextActive: {
    color: '#f39c12',
  },
  targetYearBadge: {
    backgroundColor: '#eef2f7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 6,
    marginTop: 2,
  },
  targetYearBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#4a5568',
  },
});

export default SendAnnouncementScreen;
