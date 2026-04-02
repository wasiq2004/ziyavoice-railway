import { useState, useCallback } from 'react';
import { checkUserPlanAccess, PlanAccessInfo } from '../utils/adminApi';

interface UsePlanAccessResult {
    /** Call this before a restricted action. Returns true if allowed, false if blocked (modal will show). */
    checkAccess: (userId: string) => Promise<boolean>;
    /** The reason for blocking (null if not blocked) */
    blockingReason: 'insufficient_credits' | 'plan_expired' | null;
    /** Call this to dismiss the upgrade modal */
    clearBlock: () => void;
    /** Whether the check is in progress */
    checking: boolean;
}

/**
 * usePlanAccess — A hook to enforce plan access control before restricted actions.
 * 
 * Usage:
 *   const { checkAccess, blockingReason, clearBlock } = usePlanAccess();
 * 
 *   // Before creating agent / adding phone / running campaign:
 *   const allowed = await checkAccess(user.id);
 *   if (!allowed) return; // UpgradePlanModal will auto-show via blockingReason
 *
 *   // In JSX: <UpgradePlanModal reason={blockingReason} onClose={clearBlock} />
 */
export function usePlanAccess(): UsePlanAccessResult {
    const [blockingReason, setBlockingReason] = useState<'insufficient_credits' | 'plan_expired' | null>(null);
    const [checking, setChecking] = useState(false);

    const checkAccess = useCallback(async (userId: string): Promise<boolean> => {
        if (!userId) return true; // fail-open if no user
        setChecking(true);
        try {
            const info: PlanAccessInfo = await checkUserPlanAccess(userId);
            if (!info.can_access) {
                setBlockingReason(info.blocking_reason);
                return false;
            }
            return true;
        } catch (err) {
            // On network error, fail-open (don't block user)
            console.warn('Plan access check failed, allowing action:', err);
            return true;
        } finally {
            setChecking(false);
        }
    }, []);

    const clearBlock = useCallback(() => {
        setBlockingReason(null);
    }, []);

    return { checkAccess, blockingReason, clearBlock, checking };
}
