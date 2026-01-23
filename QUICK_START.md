# 🚀 QUICK START - Timetable Feature

## ⚡ 30-Second Setup

### 1. Faculty Setup (Firebase)
```javascript
// Add to Firestore: faculty/{uid}
{
  classes: ["CS-A", "CS-B"]  // ← ADD THIS
}
```

### 2. CR Setup (Already in AsyncStorage)
```javascript
// AsyncStorage should have:
crData → class: "CS-A"  // ← VERIFY THIS
```

### 3. Deploy Security Rules
```bash
# Copy content from: firebase/timetable_security_rules.txt
# Paste in: Firebase Console → Firestore → Rules
```

---

## 🎯 How It Works

### Faculty Flow:
1. Open Timetable → See Mon-Fri, P1-P6 grid
2. Click "Edit Timetable" → Cells become editable
3. Tap any cell → Add subject + class
4. Click "Save Changes" → Updates Firebase
5. Click "Cancel" → Discards changes

### CR Flow:
1. Open Timetable → See Mon-Fri, P1-P6 grid
2. Automatically updates when faculty saves
3. No edit button (read-only)
4. Toggle between Week/Daily view

---

## 📱 Key Features

✅ **Predefined Framework**: Mon-Fri, 6 periods, always visible  
✅ **Faculty Edit**: Add/Edit/Delete with Save/Cancel  
✅ **Real-time Updates**: CR sees changes instantly (1-2s)  
✅ **Modern UI**: Cards, shadows, rounded corners  
✅ **Responsive**: Works on mobile, tablet, web  
✅ **Validation**: Faculty can only edit their classes  

---

## 🐛 Quick Fixes

**Problem**: Edit button not showing  
→ **Fix**: Check faculty document has `classes` array

**Problem**: CR not seeing updates  
→ **Fix**: Verify class names match exactly

**Problem**: Cannot save  
→ **Fix**: Ensure class is in faculty's classes array

**Problem**: Timetable empty  
→ **Fix**: Check Firebase connection & auth

---

## 📂 Files

**Main Code**: `screens/TimetableScreen.js`  
**Docs**: `TIMETABLE_IMPLEMENTATION.md`  
**Testing**: `TESTING_GUIDE.md`  
**Security**: `firebase/timetable_security_rules.txt`  

---

## 🎓 Test Scenario

### Quick Test (5 minutes):
1. Login as faculty
2. Edit → Add "Data Structures" to CS-A, Monday P1
3. Save
4. Open CR app (CS-A)
5. Verify "Data Structures" appears automatically

---

## 📊 Expected Results

✓ Faculty sees "Edit Timetable" button  
✓ Edit mode shows Save/Cancel buttons  
✓ Can add subject + class to any period  
✓ Save writes to Firebase successfully  
✓ CR receives update within 2 seconds  
✓ Week and Daily views both work  
✓ No errors in console  

---

## 🎨 UI Preview

```
┌─────────────────────────────────────┐
│  ← Timetable              [Toggle] │
├─────────────────────────────────────┤
│  [Edit Timetable] or [Cancel][Save]│
├─────────────────────────────────────┤
│     Mon   Tue   Wed   Thu   Fri    │
├─────────────────────────────────────┤
│ P1  □     ■     □     ■     □      │
│ P2  ■     □     ■     □     ■      │
│ P3  □     ■     □     ■     □      │
│ P4  ■     □     ■     □     ■      │
│ P5  □     ■     □     ■     □      │
│ P6  ■     □     ■     □     ■      │
└─────────────────────────────────────┘

■ = Filled period (green)
□ = Empty period (white)
```

---

## 🔗 Links to Full Documentation

📘 **Complete Guide**: TIMETABLE_IMPLEMENTATION.md  
🧪 **Testing Steps**: TESTING_GUIDE.md  
🏗️ **Architecture**: DATA_FLOW_DIAGRAM.md  
📄 **Summary**: IMPLEMENTATION_SUMMARY.md  

---

**Status**: ✅ READY TO TEST  
**Version**: 1.0.0  
**Date**: Jan 19, 2026
