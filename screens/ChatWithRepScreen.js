import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
    FlatList,
    SafeAreaView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

const ChatWithRepScreen = () => {
  const router = useRouter();
  const navigation = useNavigation();
  const { classId, year } = useLocalSearchParams();
  
  const [messages, setMessages] = useState([
    {
      id: '1',
      sender: 'rep',
      senderName: 'Rahul Kumar',
      message: 'Hi, I\'ve submitted the attendance for yesterday\'s class',
      timestamp: '10:30 AM',
    },
    {
      id: '2',
      sender: 'faculty',
      senderName: 'You',
      message: 'Great! I\'ll review it shortly',
      timestamp: '10:32 AM',
    },
    {
      id: '3',
      sender: 'rep',
      senderName: 'Rahul Kumar',
      message: 'Also, students are asking about the assignment deadline. Can you confirm?',
      timestamp: '10:35 AM',
    },
    {
      id: '4',
      sender: 'faculty',
      senderName: 'You',
      message: 'I\'ll send an announcement today with the updated deadline',
      timestamp: '10:36 AM',
    },
  ]);

  const [inputMessage, setInputMessage] = useState('');
  const flatListRef = useRef(null);

  useEffect(() => {
    // Scroll to bottom when messages change
    flatListRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  const handleSendMessage = () => {
    if (!inputMessage.trim()) return;

    const newMessage = {
      id: String(Date.now()),
      sender: 'faculty',
      senderName: 'You',
      message: inputMessage.trim(),
      timestamp: new Date().toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    setMessages([...messages, newMessage]);
    setInputMessage('');
  };

  const renderMessageItem = ({ item }) => {
    const isFromFaculty = item.sender === 'faculty';

    return (
      <View
        style={[
          styles.messageContainer,
          isFromFaculty && styles.messageContainerRight,
        ]}
      >
        <View
          style={[
            styles.messageBubble,
            isFromFaculty && styles.messageBubbleRight,
          ]}
        >
          <Text
            style={[
              styles.messageText,
              isFromFaculty && styles.messageTextRight,
            ]}
          >
            {item.message}
          </Text>
          <Text
            style={[
              styles.messageTime,
              isFromFaculty && styles.messageTimeRight,
            ]}
          >
            {item.timestamp}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color="#2c3e50" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Rahul Kumar</Text>
          <Text style={styles.headerSubtitle}>Class Representative - {year}</Text>
        </View>
        <TouchableOpacity style={styles.infoButton}>
          <Ionicons name="information-circle" size={24} color="#3498db" />
        </TouchableOpacity>
      </View>

      <View style={styles.classInfoBar}>
        <Ionicons name="people" size={14} color="#3498db" />
        <Text style={styles.classInfoText}>{year} - Class {classId}</Text>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessageItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
      />

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          value={inputMessage}
          onChangeText={setInputMessage}
          placeholderTextColor="#bdc3c7"
          multiline={true}
          maxLength={500}
        />
        <TouchableOpacity
          style={[styles.sendButton, !inputMessage.trim() && styles.sendButtonDisabled]}
          onPress={handleSendMessage}
          disabled={!inputMessage.trim()}
        >
          <Ionicons name="send" size={18} color="#ffffff" />
        </TouchableOpacity>
      </View>
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
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#ecf0f1',
  },
  headerContent: {
    flex: 1,
    marginLeft: 12,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2c3e50',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#7f8c8d',
    marginTop: 2,
  },
  infoButton: {
    paddingHorizontal: 8,
  },
  classInfoBar: {
    backgroundColor: '#d6eaf8',
    paddingVertical: 8,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  classInfoText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2c3e50',
    marginLeft: 6,
  },
  messagesList: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  messageContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginBottom: 8,
  },
  messageContainerRight: {
    justifyContent: 'flex-end',
  },
  messageBubble: {
    maxWidth: '80%',
    backgroundColor: '#ecf0f1',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  messageBubbleRight: {
    backgroundColor: '#3498db',
  },
  messageText: {
    fontSize: 13,
    color: '#2c3e50',
  },
  messageTextRight: {
    color: '#ffffff',
  },
  messageTime: {
    fontSize: 9,
    color: '#7f8c8d',
    marginTop: 4,
  },
  messageTimeRight: {
    color: '#ecf0f1',
  },
  inputContainer: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: '#ecf0f1',
  },
  input: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#ecf0f1',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 8,
    fontSize: 12,
    maxHeight: 100,
    color: '#2c3e50',
  },
  sendButton: {
    backgroundColor: '#3498db',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#bdc3c7',
  },
});

export default ChatWithRepScreen;
