# 🚀 Quick Start & Testing Guide

## Prerequisites Setup

### 1. Faculty Data Setup in Firebase
Ensure each faculty document has a `classes` array:

```javascript
// Firestore: faculty/{facultyUID}
{
  name: "Dr. John Doe",
  email: "john@college.edu",
  classes: ["CS-A", "CS-B", "ME-A"],  // ← REQUIRED
  department: "Computer Science",
  designation: "Professor"
}
```

### 2. CR Data Setup
Ensure CR data stored in AsyncStorage has a `class` field:

```javascript
// AsyncStorage: 'crData'
{
  name: "Jane Smith",
  email: "jane@college.edu",
  class: "CS-A",  // ← REQUIRED (or classSection)
  rollNo: "2023001"
}
```

---

## 🧪 Testing Steps

### Test 1: Faculty View Timetable
1. Login as faculty user
2. Navigate to Timetable screen
3. **Expected Result**:
   - See predefined Monday-Friday grid
   - 6 periods (P1-P6) displayed
   - "Edit Timetable" button visible
   - Week/Daily toggle available

### Test 2: Faculty Edit Mode
1. As faculty, click "Edit Timetable" button
2. **Expected Result**:
   - Button changes to "Cancel" and "Save Changes"
   - All cells become editable (visual border change)
   - Info message updates

### Test 3: Faculty Add Class
1. In edit mode, tap any empty cell (e.g., Monday, Period 1)
2. Enter:
   - Subject: "Data Structures"
   - Class: "CS-A" (must be in faculty's classes array)
3. Click "Save Class"
4. **Expected Result**:
   - Modal closes
   - Cell now shows subject and class
   - Green border on filled cell

### Test 4: Faculty Edit Existing Class
1. Tap a cell with existing class
2. Modify subject or class
3. Click "Save Class"
4. **Expected Result**:
   - Cell updates with new information

### Test 5: Faculty Delete Class
1. Tap a cell with existing class
2. Click "Delete Class"
3. Confirm deletion
4. **Expected Result**:
   - Cell becomes empty

### Test 6: Faculty Save Changes
1. After making several edits
2. Click "Save Changes" button
3. Confirm save
4. **Expected Result**:
   - Loading indicator appears
   - Success alert shown
   - Exit edit mode
   - Changes persisted to Firebase

### Test 7: Faculty Cancel Changes
1. Make some edits (don't save)
2. Click "Cancel" button
3. Confirm discard
4. **Expected Result**:
   - All unsaved changes reverted
   - Timetable restored to last saved state

### Test 8: CR View Timetable (Real-time Update)
1. Login as CR for class "CS-A"
2. Navigate to Timetable screen
3. **Expected Result**:
   - See timetable for CS-A only
   - No "Edit Timetable" button
   - Read-only view
   - Info message about auto-updates

### Test 9: Real-time Update Test
**Setup**: Have both faculty and CR apps open simultaneously

1. **Faculty**: Add/edit a class for "CS-A"
2. **Faculty**: Click "Save Changes"
3. **CR (CS-A)**: Watch the timetable screen
4. **Expected Result**:
   - CR's timetable updates automatically
   - No refresh needed
   - Changes appear within 1-2 seconds

### Test 10: View Mode Toggle
1. Toggle between "Week" and "Daily" view
2. **Expected Result**:
   - Week: Grid layout with all days visible
   - Daily: Card list grouped by day, showing all 6 periods per day

### Test 11: Validation Tests
1. **Test Empty Subject**:
   - Try to save without subject → Error shown
   
2. **Test Empty Class**:
   - Try to save without class → Error shown
   
3. **Test Unauthorized Class**:
   - Faculty with classes ["CS-A"] tries to add "ME-B"
   - → Error: "You can only add timetable entries for classes you handle"

---

## 📱 Device Testing

### Android Testing
```bash
cd cc
npm start
# Press 'a' for Android
```

### iOS Testing
```bash
cd cc
npm start
# Press 'i' for iOS
```

### Web Testing
```bash
cd cc
npm start
# Press 'w' for web
```

---

## 🔍 Debugging

### Check User Role Detection
Add console logs to see what role is detected:
```javascript
// In TimetableScreen.js
console.log('User Role:', userRole);
console.log('Faculty Classes:', facultyClasses);
console.log('CR Class:', userClass);
```

### Check Firebase Data Loading
```javascript
console.log('Timetable Data:', timetable);
console.log('Loading Status:', loading);
```

### Check Real-time Listener
```javascript
// In loadCRTimetable function
console.log('Setting up listener for class:', classSection);
```

### Firebase Console Checks
1. **Firestore Database** → `timetables` collection
2. Verify document exists for each class (e.g., "CS-A")
3. Check `schedule` field contains data
4. Verify `lastUpdated` timestamp changes after save

---

## 🐛 Common Issues & Solutions

### Issue 1: "Edit Timetable" button not showing
**Cause**: User role not detected as faculty  
**Solution**: 
- Check faculty document exists in Firestore with correct UID
- Verify user is logged in
- Check console for auth errors

### Issue 2: Cannot edit certain classes
**Cause**: Class not in faculty's `classes` array  
**Solution**: 
- Add class to faculty document: `classes: ["CS-A", "CS-B"]`
- Reload app

### Issue 3: CR not seeing timetable
**Cause**: 
- Class name mismatch
- No timetable document exists
**Solution**: 
- Verify CR's class field matches timetable document ID exactly
- Create timetable document if needed

### Issue 4: Real-time updates not working
**Cause**: 
- Firebase listener not active
- Internet connection issue
**Solution**: 
- Check console for listener errors
- Verify internet connection
- Check Firebase project has Firestore enabled

### Issue 5: Timetable shows empty after faculty saves
**Cause**: Data structure mismatch  
**Solution**: 
- Ensure each timetable entry has `class` field
- Check that class matches document ID

---

## 📊 Sample Test Data

### Faculty Test Account
```javascript
// Firestore: faculty/testFacultyUID
{
  name: "Dr. Test Faculty",
  email: "faculty@test.com",
  classes: ["CS-A", "CS-B"],
  department: "Computer Science",
  designation: "Professor"
}
```

### CR Test Account
```javascript
// AsyncStorage: crData
{
  name: "Test CR",
  email: "cr@test.com",
  class: "CS-A",
  rollNo: "2023001"
}
```

### Sample Timetable Data
```javascript
// Firestore: timetables/CS-A
{
  class: "CS-A",
  lastUpdated: "2026-01-19T10:30:00Z",
  updatedBy: "testFacultyUID",
  schedule: {
    "Monday-Period1": {
      subject: "Data Structures",
      class: "CS-A",
      day: "Monday",
      period: 1,
      time: "09:00 - 10:00"
    },
    "Monday-Period2": {
      subject: "Algorithms",
      class: "CS-A",
      day: "Monday",
      period: 2,
      time: "10:00 - 11:00"
    },
    "Tuesday-Period1": {
      subject: "Database Systems",
      class: "CS-A",
      day: "Tuesday",
      period: 1,
      time: "09:00 - 10:00"
    }
  }
}
```

---

## ✅ Testing Checklist

Use this checklist to ensure everything works:

**Faculty Tests:**
- [ ] Can view timetable framework
- [ ] "Edit Timetable" button visible
- [ ] Can enter edit mode
- [ ] Can add new class
- [ ] Can edit existing class
- [ ] Can delete class
- [ ] Can save changes
- [ ] Can cancel changes
- [ ] Cannot add unauthorized classes
- [ ] Week view works
- [ ] Daily view works

**CR Tests:**
- [ ] Can view timetable
- [ ] Cannot see edit button
- [ ] Cannot edit cells
- [ ] Receives real-time updates
- [ ] Week view works
- [ ] Daily view works
- [ ] Sees only their class data

**UI/UX Tests:**
- [ ] Loading indicator shows
- [ ] Responsive on mobile
- [ ] Responsive on tablet
- [ ] All buttons accessible
- [ ] Modal animations smooth
- [ ] Colors and fonts consistent
- [ ] No layout overflow issues

---

## 🎯 Performance Benchmarks

- **Initial Load**: < 2 seconds
- **Edit Mode Switch**: < 500ms
- **Save Operation**: < 3 seconds
- **Real-time Update Latency**: < 2 seconds
- **View Toggle**: < 300ms

---

## 📞 Need Help?

If you encounter issues:

1. Check browser/mobile console for errors
2. Verify Firebase connection in Network tab
3. Check Firestore data structure matches documentation
4. Ensure all dependencies are installed (`npm install`)
5. Try clearing cache and restarting app

---

**Last Updated**: January 19, 2026  
**Version**: 1.0.0  
**Status**: ✅ Ready for Testing
