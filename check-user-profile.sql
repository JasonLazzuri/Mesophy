-- Check user profile and role
SELECT 
    up.id,
    up.email,
    up.role,
    up.organization_id,
    o.name as org_name,
    up.created_at
FROM user_profiles up
LEFT JOIN organizations o ON up.organization_id = o.id
ORDER BY up.created_at DESC;

-- Check polling configurations
SELECT 
    pc.organization_id,
    o.name as org_name,
    pc.timezone,
    pc.emergency_override,
    pc.created_at
FROM polling_configurations pc
LEFT JOIN organizations o ON pc.organization_id = o.id
ORDER BY pc.created_at DESC;
