# Location Update Functionality Testing Guide

## Pre-Testing Setup

### 1. Database Schema Fix
First, ensure the database schema is updated:
```sql
-- Run this in your Supabase SQL editor or via CLI
-- File: /supabase/add_locations_is_active.sql
ALTER TABLE locations 
ADD COLUMN is_active BOOLEAN DEFAULT true;

UPDATE locations SET is_active = true WHERE is_active IS NULL;
```

### 2. Verify Server is Running
```bash
npm run dev
```

## Test Scenarios

### Test 1: Valid Location Update (Happy Path)
**Objective**: Verify successful location update with all valid data

**Steps**:
1. Navigate to `/dashboard/locations`
2. Click "Edit" on any location
3. Modify the following fields:
   - Name: "Updated Test Location"
   - Address: "123 Main Street, City, State 12345"
   - Phone: "555-123-4567"
   - Timezone: "America/Chicago"
   - Keep "Location is active" checked
4. Click "Update Location"

**Expected Result**:
- Success message or redirect to locations list
- Location appears with updated information
- Check browser console for success logs

### Test 2: Validation Errors
**Objective**: Test form validation and error handling

**Sub-test 2a: Required Field Validation**
1. Clear the "Location Name" field
2. Click "Update Location"
3. **Expected**: Error message "Location name is required"

**Sub-test 2b: Field Length Validation**
1. Enter "A" in the name field (too short)
2. Click "Update Location"
3. **Expected**: Error message "Location name must be at least 2 characters"

**Sub-test 2c: Address Validation**
1. Clear the address field
2. Click "Update Location"
3. **Expected**: Error message "Address is required"

**Sub-test 2d: Phone Validation**
1. Enter "123" in phone field (too short)
2. Click "Update Location"
3. **Expected**: Error message "Phone number must be between 10 and 20 characters"

### Test 3: District Change
**Objective**: Test changing location district

**Steps**:
1. Select a different district from the dropdown
2. Fill out other required fields
3. Click "Update Location"

**Expected Result**:
- Location successfully moved to new district
- Proper permission checks applied based on user role

### Test 4: Role-Based Access Control
**Objective**: Test different user roles can/cannot update locations

**For super_admin**:
- Should be able to update any location
- Should be able to change districts

**For district_manager**:
- Should only update locations in their managed districts
- Should be able to change districts (within their organization)

**For location_manager**:
- Should only update their assigned location
- Should NOT be able to change district

### Test 5: Error Scenarios
**Objective**: Test error handling for various failure conditions

**Sub-test 5a: Duplicate Name**
1. Try to update a location with a name that already exists in the same district
2. **Expected**: Error message "A location with this name already exists in this district"

**Sub-test 5b: Invalid District**
1. Modify the request in browser dev tools to send invalid district_id
2. **Expected**: Error message "Invalid district selected"

**Sub-test 5c: Network Error**
1. Disconnect internet or stop the server
2. Try to update a location
3. **Expected**: Error message about network connectivity

### Test 6: Database Issues
**Objective**: Test handling of database-related errors

**Sub-test 6a: Missing Column (if is_active not added)**
1. Try to update a location
2. Check server logs for column not found error
3. **Expected**: Proper error message to user, detailed log on server

## Debugging Checklist

### Browser Console Logs
Check for these log messages:
- `[PUT /api/locations/{id}] Starting location update request`
- `[PUT] User authenticated: {user_id}`
- `[PUT] Request data: {data}`
- `[PUT] Updating location with data: {updateData}`
- `[PUT] Location updated successfully: {result}`

### Server Console Logs
Monitor server console for:
- Authentication logs
- Validation error logs  
- Database operation logs
- Success/failure messages

### Network Tab
Verify in browser dev tools:
- PUT request to `/api/locations/{id}`
- Request payload matches form data
- Response status codes (200 for success, 4xx/5xx for errors)
- Response body contains appropriate messages

## Common Issues and Solutions

### Issue: "Database unavailable" error
**Solution**: Check Supabase environment variables and connection

### Issue: "Unauthorized" error
**Solution**: Verify user is logged in and session is valid

### Issue: "Column 'is_active' doesn't exist"
**Solution**: Run the database migration script

### Issue: "Location not found" error
**Solution**: Check location ID exists and user has permission to access it

### Issue: Form shows generic error
**Solution**: Check browser console and server logs for specific error details

## Performance Monitoring

Monitor for:
- Request response time (should be < 2 seconds)
- Database query performance
- Memory usage during updates
- No memory leaks on repeated operations

## Success Criteria

✅ All validation errors display appropriately
✅ Successful updates redirect to location list
✅ Updated data persists in database
✅ Role-based permissions enforced
✅ Detailed logging for debugging
✅ Proper error messages for different scenarios
✅ No console errors or warnings
✅ Responsive UI during loading states