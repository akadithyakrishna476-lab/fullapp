import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import {
    collection,
    doc,
    getDoc,
    onSnapshot,
    query,
    serverTimestamp,
    setDoc,
    where
} from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth, db } from '../firebase/firebaseConfig';

const ARRIVAL_STATUSES = [
    { label: 'ARRIVED', value: 'ARRIVED', color: '#2ecc71' },
    { label: 'NOT ARRIVED', value: 'NOT_ARRIVED', color: '#e74c3c' },
    { label: 'LATE', value: 'LATE', color: '#f1c40f' },
];

const CLASS_STATUSES = [
    { label: 'ONGOING', value: 'ONGOING', color: '#3498db' },
    { label: 'FREE', value: 'FREE', color: '#9b59b6' },
];

const YEARS = ['Year 1', 'Year 2', 'Year 3', 'Year 4'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Helper to get department code (consistent with TimetableScreen)
const getDepartmentCode = (deptName, deptId) => {
    const safe = (val, fallback = '') => {
        if (val === undefined || val === null) return fallback;
        const s = String(val).trim();
        if (s === 'undefined' || s === 'null' || s === '') return fallback;
        return s;
    };

    const sName = safe(deptName, null);
    const sId = safe(deptId, null);

    if (!sName) return sId || 'GEN';
    const name = sName.toLowerCase();
    if (name.includes('computer science') || name.includes('cse')) return 'CSE';
    if (name.includes('information technology') || name.includes('it')) return 'IT';
    if (name.includes('electronics') || name.includes('ece') || name.includes('communication')) return 'ECE';
    if (name.includes('electrical') || name.includes('eee')) return 'EEE';
    if (name.includes('mechanical') || name.includes('mech')) return 'MECH';
    if (name.includes('civil')) return 'CIVIL';
    if (name.includes('artificial intelligence') || name.includes('ai')) return 'AI/ML';
    if (name.includes('data science')) return 'DS';
    return sId || sName.split(' ')[0].toUpperCase();
};

const normalizeYearName = (year) => {
    if (!year) return 'Year 1';
    const s = String(year).trim();
    if (s === 'undefined' || s === 'null' || s === '') return 'Year 1';

    const y = s.toLowerCase().replace(/_/g, ' ');
    if (y === 'year 1' || y.includes('year 1') || y === '1' || y === 'first year') return 'Year 1';
    if (y === 'year 2' || y.includes('year 2') || y === '2' || y === 'second year') return 'Year 2';
    if (y === 'year 3' || y.includes('year 3') || y === '3' || y === 'third year') return 'Year 3';
    if (y === 'year 4' || y.includes('year 4') || y === '4' || y === 'fourth year') return 'Year 4';
    return 'Year 1';
};

const ClassStatusScreen = () => {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [userRole, setUserRole] = useState(null);
    const [userDept, setUserDept] = useState(null);
    const [userYear, setUserYear] = useState(null);
    const [selectedYear, setSelectedYear] = useState('Year 1');
    const [timetableSlots, setTimetableSlots] = useState([]);
    const [statusEntries, setStatusEntries] = useState({});
    const [todayDate, setTodayDate] = useState('');

    useEffect(() => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        setTodayDate(`${year}-${month}-${day}`);
        initializeUser();
    }, []);

    const initializeUser = async () => {
        try {
            const user = auth.currentUser;
            if (!user) {
                router.replace('/role-select');
                return;
            }

            // Fetch user data to determine role and department
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if (!userDoc.exists()) {
                setLoading(false);
                return;
            }

            const userData = userDoc.data();
            const role = userData.role === 'class_representative' ? 'REP' : 'FACULTY';
            setUserRole(role);

            if (role === 'REP') {
                const emailDocId = String(user.email || '').toLowerCase().replace(/[@.]/g, '_');
                const repRef = doc(db, 'classRepresentatives', emailDocId);
                const repSnap = await getDoc(repRef);

                if (repSnap.exists()) {
                    const repData = repSnap.data();
                    const dept = getDepartmentCode(repData.departmentName || repData.departmentId, repData.departmentId);
                    const normYear = normalizeYearName(repData.year || userData.year);
                    setUserDept(dept);
                    setUserYear(normYear);
                    setSelectedYear(normYear);
                } else {
                    const dept = getDepartmentCode(userData.departmentName || userData.department, userData.departmentId);
                    const normYear = normalizeYearName(userData.year);
                    setUserDept(dept);
                    setUserYear(normYear);
                    setSelectedYear(normYear);
                }
            } else {
                const facultyRef = doc(db, 'faculty', user.uid);
                const facultySnap = await getDoc(facultyRef);
                if (facultySnap.exists()) {
                    const fData = facultySnap.data();
                    const dept = getDepartmentCode(fData.departmentName || fData.department, fData.departmentId);
                    setUserDept(dept);
                }
            }
            setLoading(false);
        } catch (error) {
            console.error('Error initializing user:', error);
            setLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            let cleanup;

            if (todayDate && (userRole === 'REP' ? (userDept && selectedYear) : true)) {
                // Return a wrapper that calls the internal async cleanup
                const startFetch = async () => {
                    cleanup = await fetchTimetableAndStatuses();
                };
                startFetch();
            }

            return () => {
                if (cleanup && typeof cleanup === 'function') {
                    cleanup();
                }
            };
        }, [userRole, userDept, selectedYear, todayDate])
    );

    const fetchTimetableAndStatuses = async () => {
        try {
            setLoading(true);
            const now = new Date();
            const dayName = DAYS[now.getDay()];

            if (dayName === 'Sunday') {
                setTimetableSlots([]);
                setLoading(false);
                return;
            }

            // Both Roles (REP & FACULTY) must see the same source of truth
            // Based on Department and Selected Year
            console.log(`[DEBUG] Role: ${userRole}, Dept: ${userDept}, Year: ${selectedYear}, Date: ${todayDate}`);

            if (!userDept || !selectedYear) {
                console.warn('[DEBUG] Missing dept or year, skipping fetch');
                setLoading(false);
                return;
            }

            let unsubSlots = () => { };
            let unsubStatus = () => { };

            // 1. Listen to recurring slots (Shared)
            const slotsPath = `timetable/${userDept}/${selectedYear}/${dayName}/slots`;
            console.log(`[DEBUG] Listening to slots at: ${slotsPath}`);
            const slotsRef = collection(db, 'timetable', userDept, selectedYear, dayName, 'slots');
            unsubSlots = onSnapshot(slotsRef, (snapshot) => {
                console.log(`[DEBUG] Received ${snapshot.size} slots`);
                const slots = snapshot.docs.map(d => ({
                    id: d.id,
                    ...d.data()
                }));
                slots.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
                setTimetableSlots(slots);
            });

            // 2. Listen to today's statuses (Shared - No facultyId filtering)
            console.log(`[DEBUG] Querying classStatus for Date: ${todayDate}, Dept: ${userDept}, Year: ${selectedYear}`);
            const statusQuery = query(
                collection(db, 'classStatus'),
                where('date', '==', todayDate),
                where('department', '==', userDept),
                where('year', '==', selectedYear)
            );
            unsubStatus = onSnapshot(statusQuery, (snapshot) => {
                console.log(`[DEBUG] Received ${snapshot.size} status entries`);
                const entries = {};
                snapshot.docs.forEach(d => {
                    const data = d.data();
                    console.log(`[DEBUG] Status found for slotId: ${data.slotId} -> ${data.facultyArrivalStatus}`);
                    entries[data.slotId] = data;
                });
                setStatusEntries(entries);
            });

            setLoading(false);
            return () => {
                unsubSlots();
                unsubStatus();
            };
        } catch (error) {
            console.error('Error fetching data:', error);
            setLoading(false);
        }
    };

    const markStatus = async (slot, arrivalStatus) => {
        if (userRole !== 'REP') return;

        // Validation: FREE only if NOT_ARRIVED
        const currentClassStatus = arrivalStatus === 'NOT_ARRIVED' ? 'FREE' : 'ONGOING';

        try {
            // Unique ID: date_dept_year_slotId
            // Path: classStatus/{statusId}
            const statusId = `${todayDate}_${userDept}_${selectedYear}_${slot.id}`.replace(/\s+/g, '_');
            console.log(`[DEBUG] Marking status for ID: ${statusId}`);
            const docRef = doc(db, 'classStatus', statusId);

            await setDoc(docRef, {
                date: todayDate,
                department: userDept,
                year: selectedYear,
                slotId: slot.id,
                facultyId: slot.facultyId || null,
                subjectName: slot.subjectName || '',
                timeSlot: slot.timeSlot || slot.label || '',
                facultyArrivalStatus: arrivalStatus,
                classStatus: currentClassStatus,
                markedBy: 'REP',
                statusMarkedAt: new Date().toISOString(),
                statusMarkedBy: auth.currentUser.uid,
                timestamp: serverTimestamp(),
            });

            Alert.alert('Success', 'Status marked successfully');
        } catch (error) {
            console.error('Error marking status:', error);
            Alert.alert('Error', 'Failed to mark status');
        }
    };

    const renderSlotItem = ({ item }) => {
        const status = statusEntries[item.id];
        const isMarked = !!status;

        return (
            <View style={styles.card}>
                <View style={styles.cardHeader}>
                    <View style={{ flex: 1, marginRight: 10 }}>
                        <Text style={styles.periodLabel}>{item.timeSlot}</Text>
                        <Text style={styles.subjectText}>{item.subjectName}</Text>
                        <Text style={styles.facultyNameText}>
                            {item.facultyName || 'Faculty not assigned'}
                        </Text>
                    </View>
                    {isMarked && (
                        <View style={styles.markedBadge}>
                            <Text style={styles.statusAlreadyMarkedText}>Status already marked</Text>
                            <Text style={styles.markedText}>By Year Rep</Text>
                        </View>
                    )}
                </View>

                <View style={styles.cardBody}>
                    <Text style={styles.label}>Faculty Arrival Status:</Text>
                    <View style={styles.statusRow}>
                        {ARRIVAL_STATUSES.map((s) => {
                            const isActive = status?.facultyArrivalStatus === s.value;
                            return (
                                <TouchableOpacity
                                    key={s.value}
                                    disabled={isMarked || userRole !== 'REP'}
                                    style={[
                                        styles.statusButton,
                                        { borderColor: s.color },
                                        isActive && { backgroundColor: s.color },
                                        (isMarked && !isActive) && styles.disabledButton
                                    ]}
                                    onPress={() => markStatus(item, s.value)}
                                >
                                    <Text style={[styles.statusButtonText, isActive && { color: '#fff' }]}>
                                        {s.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {isMarked && (
                        <View style={styles.classStatusContainer}>
                            <Text style={styles.label}>Class Status:</Text>
                            <View
                                style={[
                                    styles.classStatusBadge,
                                    { backgroundColor: status.classStatus === 'FREE' ? '#9b59b6' : '#3498db' }
                                ]}
                            >
                                <Text style={styles.classStatusText}>{status.classStatus}</Text>
                            </View>
                        </View>
                    )}
                </View>
            </View>
        );
    };

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color="#16a085" />
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color="#fff" />
                </TouchableOpacity>
                <View>
                    <Text style={styles.headerTitle}>Daily Class Status</Text>
                    <Text style={styles.headerSubTitle}>{todayDate}</Text>
                </View>
            </View>

            <View style={styles.filterSection}>
                {userRole === 'REP' ? (
                    <Text style={styles.infoText}>
                        Marking status for {userDept} - {userYear}
                    </Text>
                ) : (
                    <Text style={styles.infoText}>
                        Your assigned classes for today
                    </Text>
                )}
                {userRole === 'FACULTY' && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.yearSelector}>
                        {YEARS.map((y) => (
                            <TouchableOpacity
                                key={y}
                                style={[styles.yearButton, selectedYear === y && styles.yearButtonActive]}
                                onPress={() => setSelectedYear(y)}
                            >
                                <Text style={[styles.yearButtonText, selectedYear === y && styles.yearButtonTextActive]}>
                                    {y}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                )}
            </View>

            {timetableSlots.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Ionicons name="calendar-outline" size={64} color="#ccc" />
                    <Text style={styles.emptyText}>No classes scheduled for today.</Text>
                </View>
            ) : (
                <FlatList
                    data={timetableSlots}
                    keyExtractor={(item) => item.id}
                    renderItem={renderSlotItem}
                    contentContainerStyle={styles.listContent}
                />
            )}
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8f9fa',
    },
    header: {
        backgroundColor: '#16a085',
        padding: 20,
        flexDirection: 'row',
        alignItems: 'center',
    },
    backButton: {
        marginRight: 15,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#fff',
    },
    headerSubTitle: {
        fontSize: 14,
        color: '#e0f2f1',
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    filterSection: {
        padding: 15,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    infoText: {
        fontSize: 14,
        color: '#2c3e50',
        fontWeight: '600',
        marginBottom: 10,
    },
    yearSelector: {
        flexDirection: 'row',
    },
    yearButton: {
        paddingHorizontal: 15,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#f1f2f6',
        marginRight: 10,
    },
    yearButtonActive: {
        backgroundColor: '#16a085',
    },
    yearButtonText: {
        fontSize: 12,
        color: '#7f8c8d',
    },
    yearButtonTextActive: {
        color: '#fff',
        fontWeight: 'bold',
    },
    listContent: {
        padding: 15,
    },
    card: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 15,
        marginBottom: 15,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#f1f2f6',
        paddingBottom: 10,
    },
    periodLabel: {
        fontSize: 12,
        color: '#95a5a6',
        fontWeight: '600',
    },
    subjectText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#2c3e50',
        marginTop: 2,
    },
    facultyNameText: {
        fontSize: 12,
        color: '#7f8c8d',
        fontWeight: '500',
        marginTop: 2,
    },
    markedBadge: {
        backgroundColor: '#e8f5e9',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        alignItems: 'flex-end',
    },
    statusAlreadyMarkedText: {
        fontSize: 10,
        color: '#e67e22',
        fontWeight: '700',
        marginBottom: 2,
    },
    markedText: {
        fontSize: 10,
        color: '#2e7d32',
        fontWeight: '600',
    },
    cardBody: {},
    label: {
        fontSize: 13,
        color: '#7f8c8d',
        marginBottom: 10,
    },
    statusRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    statusButton: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 8,
        borderWidth: 1,
        alignItems: 'center',
        marginHorizontal: 4,
    },
    statusButtonText: {
        fontSize: 10,
        fontWeight: 'bold',
    },
    disabledButton: {
        opacity: 0.3,
        borderColor: '#ccc',
    },
    classStatusContainer: {
        marginTop: 15,
        flexDirection: 'row',
        alignItems: 'center',
    },
    classStatusBadge: {
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 15,
        marginLeft: 10,
    },
    classStatusText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: 'bold',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    emptyText: {
        marginTop: 15,
        fontSize: 16,
        color: '#95a5a6',
        textAlign: 'center',
    },
});

export default ClassStatusScreen;
