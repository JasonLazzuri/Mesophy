-- Check what notification types are allowed
SELECT 
    '=== NOTIFICATION TYPE ENUM VALUES ===' as section,
    enumlabel as allowed_values
FROM pg_enum 
WHERE enumtypid = (
    SELECT oid 
    FROM pg_type 
    WHERE typname = 'notification_type'
);

-- Also check the device_notifications table structure
SELECT 
    '=== DEVICE_NOTIFICATIONS TABLE STRUCTURE ===' as section,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'device_notifications'
ORDER BY ordinal_position;