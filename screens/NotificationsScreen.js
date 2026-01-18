import { collection, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth, db } from '../firebase/firebaseConfig';

const NotificationsScreen = () => {
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'notifications'), (snap) => {
      const user = auth.currentUser;
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Filter notifications intended for this user or global ones
      const filtered = items.filter(n => {
        if (!user) return false;
        return (n.recipientUid && n.recipientUid === user.uid) || (n.recipient === 'all');
      }).sort((a, b) => {
        const ta = a.timestamp && a.timestamp.toDate ? a.timestamp.toDate().getTime() : (a.timestamp || 0);
        const tb = b.timestamp && b.timestamp.toDate ? b.timestamp.toDate().getTime() : (b.timestamp || 0);
        return tb - ta;
      });
      setNotifications(filtered);
    });
    return () => unsub();
  }, []);

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
    <TouchableOpacity style={[styles.item, item.read ? styles.read : styles.unread]} onPress={() => markAsRead(item)}>
      <Text style={styles.itemTitle}>{item.title || 'Announcement'}</Text>
      {item.body ? <Text style={styles.itemBody}>{item.body}</Text> : null}
      <Text style={styles.itemTime}>{item.timestamp && item.timestamp.toDate ? item.timestamp.toDate().toLocaleString() : ''}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Notifications</Text>
      {notifications.length === 0 ? (
        <View style={styles.center}><Text style={styles.sub}>No new notifications</Text></View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 12 }}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: '#2c3e50' },
  sub: { marginTop: 8, color: '#7f8c8d' },
});

export default NotificationsScreen;
