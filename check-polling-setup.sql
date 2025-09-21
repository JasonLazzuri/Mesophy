-- Check polling configuration setup

-- 1. Check if table exists
SELECT 
    '=== TABLE STATUS ===' as section,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'polling_configurations') 
        THEN '✅ polling_configurations table exists'
        ELSE '❌ polling_configurations table missing'
    END as table_status;

-- 2. Check organizations
SELECT 
    '=== ORGANIZATIONS ===' as section,
    id,
    name,
    created_at
FROM organizations
ORDER BY created_at;

-- 3. Check existing polling configurations  
SELECT 
    '=== EXISTING CONFIGS ===' as section,
    pc.organization_id,
    o.name as org_name,
    pc.timezone,
    pc.emergency_override,
    pc.created_at
FROM polling_configurations pc
LEFT JOIN organizations o ON pc.organization_id = o.id
ORDER BY pc.created_at;

-- 4. Insert default config if missing
INSERT INTO polling_configurations (organization_id, timezone) 
SELECT 
    id,
    'America/Los_Angeles'
FROM organizations 
WHERE id NOT IN (SELECT organization_id FROM polling_configurations);

-- 5. Verify final state
SELECT 
    '=== FINAL STATUS ===' as section,
    COUNT(*) as total_orgs,
    COUNT(pc.id) as configs_created,
    CASE 
        WHEN COUNT(*) = COUNT(pc.id) THEN '✅ All organizations have polling configs'
        ELSE '⚠️ Some organizations missing configs'
    END as status
FROM organizations o
LEFT JOIN polling_configurations pc ON o.id = pc.organization_id;