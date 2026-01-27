import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
  FlatList
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { reactivateCRAccount, listInactiveCRs, getCRAccountStatus } from '../utils/crReactivation';

const CRReactivationAdminScreen = () => {
  const [crEmail, setCrEmail] = useState('');
  const [yearLevel, setYearLevel] = useState('');
  const [department, setDepartment] = useState('');
  const [loading, setLoading] = useState(false);
  const [inactiveCRList, setInactiveCRList] = useState([]);
  const [selectedCR, setSelectedCR] = useState(null);
  const [tab, setTab] = useState('reactivate'); // 'reactivate' or 'list'

  const departments = ['IT', 'CSE', 'ECE', 'EEE', 'MECH', 'CIVIL'];

  const handleReactivate = async () => {
    if (!crEmail.trim()) {
      Alert.alert('Error', 'Please enter CR email address');
      return;
    }

    if (!yearLevel) {
      Alert.alert('Error', 'Please select a year level');
      return;
    }

    if (!department) {
      Alert.alert('Error', 'Please select a department');
      return;
    }

    setLoading(true);
    try {
      const result = await reactivateCRAccount(crEmail, parseInt(yearLevel), department);

      if (result.success) {
        Alert.alert(
          '✅ Success',
          `${result.message}\n\n` +
          `Name: ${result.details.name}\n` +
          `Email: ${result.details.email}\n` +
          `Department: ${result.details.department}\n` +
          `Year Level: ${result.details.yearLevel}\n` +
          `Joining Year: ${result.details.joiningYear}\n` +
          `Class Students: ${result.details.classStudentCount}\n\n` +
          `The CR can now log in!`
        );

        // Clear form
        setCrEmail('');
        setYearLevel('');
        setDepartment('');
      } else {
        Alert.alert('❌ Failed', result.message);
      }
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadInactiveCRs = async () => {
    setLoading(true);
    try {
      const list = await listInactiveCRs();
      setInactiveCRList(list);

      if (list.length === 0) {
        Alert.alert('Info', 'No inactive CRs found in the system.');
      }
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectInactiveCR = async (cr) => {
    setSelectedCR(cr);
    setYearLevel(cr.yearLevel.toString());
    setDepartment(cr.department);
    setCrEmail(cr.email);
  };

  const handleCheckStatus = async () => {
    if (!crEmail.trim()) {
      Alert.alert('Error', 'Please enter CR email address');
      return;
    }

    setLoading(true);
    try {
      const status = await getCRAccountStatus(crEmail);

      if (status.found) {
        Alert.alert(
          'CR Account Status',
          `Name: ${status.name}\n` +
          `Email: ${status.email}\n` +
          `Department: ${status.department}\n` +
          `Year Level: ${status.yearLevel}\n` +
          `Joining Year: ${status.joiningYear}\n` +
          `Status: ${status.active ? '🟢 ACTIVE' : '🔴 INACTIVE'}\n` +
          `Class Students: ${status.classStudentCount}\n` +
          `Can Login: ${status.canLogin ? '✅ Yes' : '❌ No'}\n` +
          `Ready to Reactivate: ${status.readyToReactivate ? '✅ Yes' : '❌ No (no students)'}` +
          (status.disableReason ? `\n\nDisable Reason: ${status.disableReason}` : '')
        );
      } else {
        Alert.alert('Not Found', status.message || 'CR account not found');
      }
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>CR Account Management</Text>
          <Text style={styles.headerSubtitle}>Reactivate disabled CRs</Text>
        </View>
        <Ionicons name="settings" size={28} color="#ffffff" />
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, tab === 'reactivate' && styles.tabActive]}
          onPress={() => setTab('reactivate')}
        >
          <Text style={[styles.tabText, tab === 'reactivate' && styles.tabTextActive]}>
            Reactivate CR
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'list' && styles.tabActive]}
          onPress={() => {
            setTab('list');
            loadInactiveCRs();
          }}
        >
          <Text style={[styles.tabText, tab === 'list' && styles.tabTextActive]}>
            List Inactive CRs
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentPadding}>
        {tab === 'reactivate' ? (
          <View>
            <Text style={styles.sectionTitle}>Manual Reactivation</Text>

            {/* Email Input */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>CR Email Address *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter CR email"
                placeholderTextColor="#999"
                value={crEmail}
                onChangeText={setCrEmail}
                keyboardType="email-address"
                editable={!loading}
              />
            </View>

            {/* Year Selection */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Year Level *</Text>
              <View style={styles.buttonGroup}>
                {[1, 2, 3, 4].map((year) => (
                  <TouchableOpacity
                    key={year}
                    style={[
                      styles.yearButton,
                      yearLevel === year.toString() && styles.yearButtonActive
                    ]}
                    onPress={() => setYearLevel(year.toString())}
                    disabled={loading}
                  >
                    <Text
                      style={[
                        styles.yearButtonText,
                        yearLevel === year.toString() && styles.yearButtonTextActive
                      ]}
                    >
                      Year {year}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Department Selection */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Department *</Text>
              <View style={styles.deptGrid}>
                {departments.map((dept) => (
                  <TouchableOpacity
                    key={dept}
                    style={[
                      styles.deptButton,
                      department === dept && styles.deptButtonActive
                    ]}
                    onPress={() => setDepartment(dept)}
                    disabled={loading}
                  >
                    <Text
                      style={[
                        styles.deptButtonText,
                        department === dept && styles.deptButtonTextActive
                      ]}
                    >
                      {dept}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={[styles.button, styles.buttonPrimary, loading && styles.buttonDisabled]}
                onPress={handleReactivate}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color="#fff" style={styles.buttonIcon} />
                    <Text style={styles.buttonText}>Reactivate CR</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.buttonSecondary]}
                onPress={handleCheckStatus}
                disabled={loading}
              >
                <Ionicons name="information-circle" size={20} color="#0f5f73" style={styles.buttonIcon} />
                <Text style={styles.buttonTextSecondary}>Check Status</Text>
              </TouchableOpacity>
            </View>

            {/* Info Card */}
            <View style={styles.infoCard}>
              <Ionicons name="alert-circle" size={20} color="#ff6b6b" />
              <View style={styles.infoText}>
                <Text style={styles.infoTitle}>Important</Text>
                <Text style={styles.infoContent}>
                  The class must have at least one student. If the class is empty, add students first.
                </Text>
              </View>
            </View>
          </View>
        ) : (
          <View>
            <Text style={styles.sectionTitle}>Inactive CRs</Text>

            {loading ? (
              <ActivityIndicator size="large" color="#0f5f73" style={styles.loader} />
            ) : inactiveCRList.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="checkmark-circle" size={48} color="#2ecc71" />
                <Text style={styles.emptyStateText}>No inactive CRs found</Text>
                <Text style={styles.emptyStateSubtext}>All CRs are active!</Text>
              </View>
            ) : (
              <FlatList
                data={inactiveCRList}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.crCard}
                    onPress={() => handleSelectInactiveCR(item)}
                  >
                    <View style={styles.crCardContent}>
                      <View style={styles.crCardHeader}>
                        <Text style={styles.crName}>{item.name}</Text>
                        <View style={styles.badge}>
                          <Text style={styles.badgeText}>Inactive</Text>
                        </View>
                      </View>
                      <Text style={styles.crEmail}>{item.email}</Text>
                      <View style={styles.crCardDetails}>
                        <Text style={styles.crDetail}>
                          📚 {item.department} - Year {item.yearLevel}
                        </Text>
                        <Text style={styles.crDetail} numberOfLines={1}>
                          ❌ {item.disableReason}
                        </Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#ccc" />
                  </TouchableOpacity>
                )}
              />
            )}

            {inactiveCRList.length > 0 && (
              <View style={styles.infoCard}>
                <Ionicons name="bulb" size={20} color="#f39c12" />
                <View style={styles.infoText}>
                  <Text style={styles.infoTitle}>Tip</Text>
                  <Text style={styles.infoContent}>
                    Tap a CR name to fill the form and reactivate them.
                  </Text>
                </View>
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
    backgroundColor: '#0f5f73',
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#e0f2f1',
    marginTop: 4,
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    backgroundColor: '#fff',
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#0f5f73',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#999',
  },
  tabTextActive: {
    color: '#0f5f73',
  },
  content: {
    flex: 1,
  },
  contentPadding: {
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 20,
  },
  formGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: '#fff',
    color: '#333',
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  yearButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  yearButtonActive: {
    backgroundColor: '#0f5f73',
    borderColor: '#0f5f73',
  },
  yearButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  yearButtonTextActive: {
    color: '#fff',
  },
  deptGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  deptButton: {
    width: '48%',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  deptButtonActive: {
    backgroundColor: '#2ecc71',
    borderColor: '#2ecc71',
  },
  deptButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  deptButtonTextActive: {
    color: '#fff',
  },
  buttonContainer: {
    gap: 12,
    marginTop: 20,
  },
  button: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: {
    backgroundColor: '#27ae60',
  },
  buttonSecondary: {
    backgroundColor: '#ecf0f1',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonIcon: {
    marginRight: 8,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  buttonTextSecondary: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f5f73',
  },
  infoCard: {
    backgroundColor: '#fff3cd',
    borderLeftWidth: 4,
    borderLeftColor: '#ff6b6b',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 6,
    marginTop: 20,
    flexDirection: 'row',
    gap: 12,
  },
  infoText: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#333',
    marginBottom: 4,
  },
  infoContent: {
    fontSize: 12,
    color: '#666',
    lineHeight: 18,
  },
  loader: {
    marginTop: 40,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
  },
  emptyStateSubtext: {
    fontSize: 13,
    color: '#999',
    marginTop: 8,
  },
  crCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderLeftWidth: 4,
    borderLeftColor: '#ff6b6b',
  },
  crCardContent: {
    flex: 1,
  },
  crCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  crName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
  },
  badge: {
    backgroundColor: '#ff6b6b',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  crEmail: {
    fontSize: 12,
    color: '#999',
    marginBottom: 8,
  },
  crCardDetails: {
    gap: 4,
  },
  crDetail: {
    fontSize: 11,
    color: '#666',
  },
});

export default CRReactivationAdminScreen;
