import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
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

const SendAnnouncementScreen = ({ navigation, route }) => {
  const { classId, year } = route.params || {};
  
  const [announcements, setAnnouncements] = useState([
    {
      id: '1',
      title: 'Class Rescheduled',
      message: 'Tomorrow\'s class is rescheduled to 2 PM',
      date: '2025-01-12',
      sentTo: 'Class Rep',
      read: true,
    },
    {
      id: '2',
      title: 'Assignment Deadline Extended',
      message: 'Assignment submission deadline extended by 2 days',
      date: '2025-01-10',
      sentTo: 'Class Rep',
      read: true,
    },
  ]);

  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState('compose');

  const handleSendAnnouncement = () => {
    if (!title.trim() || !message.trim()) {
      Alert.alert('Error', 'Please fill all fields');
      return;
    }

    const newAnnouncement = {
      id: String(Date.now()),
      title: title.trim(),
      message: message.trim(),
      date: new Date().toISOString().split('T')[0],
      sentTo: 'Class Rep',
      read: false,
    };

    setAnnouncements([newAnnouncement, ...announcements]);
    setTitle('');
    setMessage('');
    setActiveTab('sent');
    Alert.alert('Success', 'Announcement sent to Class Representative');
  };

  const renderAnnouncementItem = ({ item }) => (
    <View style={styles.announcementCard}>
      <View style={styles.announcementHeader}>
        <View style={styles.announcementTitleSection}>
          <Text style={styles.announcementTitle}>{item.title}</Text>
          {!item.read && <View style={styles.unreadBadge} />}
        </View>
        <Text style={styles.announcementDate}>{item.date}</Text>
      </View>
      <Text style={styles.announcementMessage}>{item.message}</Text>
      <View style={styles.announcementFooter}>
        <Text style={styles.sentToText}>Sent to: {item.sentTo}</Text>
        <TouchableOpacity style={styles.deleteButton}>
          <Ionicons name="trash" size={14} color="#e74c3c" />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color="#2c3e50" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Announcements</Text>
        <View style={{ width: 24 }} />
      </View>

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
            Sent ({announcements.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {activeTab === 'compose' ? (
          <View style={styles.composeSection}>
            <View style={styles.classInfo}>
              <Ionicons name="information-circle" size={16} color="#3498db" />
              <Text style={styles.classInfoText}>{year} - Class {classId}</Text>
            </View>

            <Text style={styles.label}>Announcement Title</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Class Rescheduled, Assignment Update"
              value={title}
              onChangeText={setTitle}
              placeholderTextColor="#bdc3c7"
            />

            <Text style={styles.label}>Message</Text>
            <TextInput
              style={[styles.input, styles.messageInput]}
              placeholder="Type your announcement message..."
              value={message}
              onChangeText={setMessage}
              placeholderTextColor="#bdc3c7"
              multiline={true}
              numberOfLines={6}
              textAlignVertical="top"
            />

            <TouchableOpacity
              style={styles.sendButton}
              onPress={handleSendAnnouncement}
            >
              <Ionicons name="send" size={16} color="#ffffff" />
              <Text style={styles.sendButtonText}>Send to Class Representative</Text>
            </TouchableOpacity>

            <View style={styles.infoBox}>
              <Ionicons name="bulb" size={16} color="#f39c12" />
              <Text style={styles.infoText}>
                Announcements are sent directly to the Class Representative who can then relay to the entire class
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.sentSection}>
            {announcements.length > 0 ? (
              <FlatList
                data={announcements}
                renderItem={renderAnnouncementItem}
                keyExtractor={item => item.id}
                scrollEnabled={false}
              />
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="mail-open" size={48} color="#bdc3c7" />
                <Text style={styles.emptyStateText}>No announcements sent yet</Text>
              </View>
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
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  composeSection: {
    marginBottom: 20,
  },
  classInfo: {
    backgroundColor: '#d6eaf8',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  classInfoText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2c3e50',
    marginLeft: 8,
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
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 10,
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
  announcementTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2c3e50',
    flex: 1,
  },
  unreadBadge: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#f39c12',
    marginLeft: 6,
  },
  announcementDate: {
    fontSize: 10,
    color: '#bdc3c7',
  },
  announcementMessage: {
    fontSize: 11,
    color: '#7f8c8d',
    marginBottom: 8,
  },
  announcementFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTopWidth: 1,
    borderTopColor: '#ecf0f1',
  },
  sentToText: {
    fontSize: 10,
    color: '#bdc3c7',
  },
  deleteButton: {
    padding: 4,
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
});

export default SendAnnouncementScreen;
