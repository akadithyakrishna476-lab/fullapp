import { collection, doc, onSnapshot, updateDoc, arrayUnion, writeBatch } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth, db } from '../firebase/firebaseConfig';
import { fetchUserRole } from '../utils/authHelpers';

const formatDateTime = (timestamp) => {
  if (!timestamp) return '';
  const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
  if (!date || Number.isNaN(date.getTime())) return '';

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

const NotificationsScreen = () => {
  const [notifications, setNotifications] = useState([]);
  const [userRole, setUserRole] = useState(null);
  const [crYear, setCrYear] = useState(null);

  const normalizeRole = (value) => (value || '').toString().toLowerCase();

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return undefined;

    let unsub = null;
    let isMounted = true;

    const init = async () => {
      try {
        const { role } = await fetchUserRole(user.uid, user.email);
        if (!isMounted) return;
        setUserRole(role);

        // Load CR year if applicable
        const roleNormalized = normalizeRole(role);
        if (roleNormalized === 'class_representative' || roleNormalized === 'representative' || roleNormalized === 'cr') {
          const storedCRData = await AsyncStorage.getItem('crData');
          if (storedCRData) {
            const data = JSON.parse(storedCRData);
            setCrYear(data.year);
          }
        }

        unsub = onSnapshot(collection(db, 'notifications'), (snap) => {
          const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          setNotifications(items);
        });
      } catch (e) {
        console.warn('Notifications load failed:', e.message);
      }
    };

    init();

    return () => {
      isMounted = false;
      if (unsub) unsub();
    };
  }, []);

  const visibleNotifications = React.useMemo(() => {
    return notifications
      .filter((n) => {
        // Deletion check
        const roleNormalized = normalizeRole(userRole);
        if (roleNormalized === 'faculty') {
          if (n.facultyDeleted) return false;
        } else if (roleNormalized === 'class_representative' || roleNormalized === 'representative' || roleNormalized === 'cr') {
          if (n.deletedByUids && Array.isArray(n.deletedByUids) && n.deletedByUids.includes(auth.currentUser?.uid)) {
            return false;
          }
        }

        const targetRole = normalizeRole(n.recipientRole);
        if (!auth.currentUser) return false;

        // Basic role and recipient matching
        let isMatch = false;
        if (n.recipientUid && n.recipientUid === auth.currentUser.uid) {
          isMatch = true;
        } else if (targetRole && roleNormalized && targetRole === roleNormalized) {
          isMatch = true;
        } else if (n.recipient === 'all') {
          isMatch = true;
        }

        if (!isMatch) return false;

        // Year-based filtering for CRs
        if (roleNormalized === 'class_representative' || roleNormalized === 'representative' || roleNormalized === 'cr') {
          if (!n.targetYear || n.targetYear === 'all') return true;
          return n.targetYear === crYear;
        }

        return true;
      })
      .sort((a, b) => {
        const ta = a.timestamp && a.timestamp.toDate ? a.timestamp.toDate().getTime() : (a.timestamp || 0);
        const tb = b.timestamp && b.timestamp.toDate ? b.timestamp.toDate().getTime() : (b.timestamp || 0);
        return tb - ta;
      });
  }, [notifications, userRole, crYear]);

  const handleDeleteNotification = async (id) => {
    Alert.alert(
      'Delete Notification',
      'Are you sure you want to delete this notification?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const docRef = doc(db, 'notifications', id);
              const roleNormalized = normalizeRole(userRole);
              if (roleNormalized === 'faculty') {
                await updateDoc(docRef, { facultyDeleted: true });
              } else {
                await updateDoc(docRef, {
                  deletedByUids: arrayUnion(auth.currentUser.uid)
                });
              }
            } catch (error) {
              console.error('Failed to delete notification', error);
              Alert.alert('Error', 'Could not delete notification.');
            }
          },
        },
      ]
    );
  };

  const handleDeleteAllNotifications = async () => {
    if (visibleNotifications.length === 0) return;

    Alert.alert(
      'Delete All',
      'Are you sure you want to clear all notifications?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            try {
              const batch = writeBatch(db);
              const roleNormalized = normalizeRole(userRole);
              const uid = auth.currentUser.uid;
              visibleNotifications.forEach((n) => {
                const docRef = doc(db, 'notifications', n.id);
                if (roleNormalized === 'faculty') {
                  batch.update(docRef, { facultyDeleted: true });
                } else {
                  batch.update(docRef, { deletedByUids: arrayUnion(uid) });
                }
              });
              await batch.commit();
            } catch (error) {
              console.error('Failed to clear notifications', error);
              Alert.alert('Error', 'Could not clear notifications.');
            }
          },
        },
      ]
    );
  };

  const markAsRead = async (item) => {
    try {
      if (!item.id) return;
      const ref = doc(db, 'notifications', item.id);
      await updateDoc(ref, { read: true });
    } catch (e) {
      console.warn('Failed to mark read', e);
    }
  };

  const renderItem = ({ item }) => (
    <View style={styles.notificationWrapper}>
      <TouchableOpacity
        style={[styles.item, item.read ? styles.read : styles.unread]}
        onPress={() => markAsRead(item)}
      >
        <Text style={styles.itemTitle}>{item.title || 'Announcement'}</Text>
        {item.body ? <Text style={styles.itemBody}>{item.body}</Text> : null}
        <Text style={styles.itemTime}>{formatDateTime(item.timestamp)}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => handleDeleteNotification(item.id)}
      >
        <Ionicons name="trash-outline" size={18} color="#e74c3c" />
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Notifications</Text>
      {visibleNotifications.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.sub}>
            No new notifications{userRole ? ` for ${normalizeRole(userRole)}` : ''}
          </Text>
        </View>
      ) : (
        <FlatList
          data={visibleNotifications}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 12 }}
        />
      )}
      {visibleNotifications.length > 0 && (
        <TouchableOpacity
          style={styles.clearAllButton}
          onPress={handleDeleteAllNotifications}
        >
          <Ionicons name="trash-outline" size={14} color="#e74c3c" />
          <Text style={styles.clearAllText}>Clear All Notifications</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: '#2c3e50' },
  sub: { marginTop: 8, color: '#7f8c8d' },
  notificationWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    overflow: 'hidden',
  },
  item: { flex: 1, padding: 12 },
  deleteButton: {
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    margin: 12,
    borderWidth: 1,
    borderColor: '#e74c3c',
    borderRadius: 8,
    borderStyle: 'dashed',
  },
  clearAllText: {
    color: '#e74c3c',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
  },
});

export default NotificationsScreen;
