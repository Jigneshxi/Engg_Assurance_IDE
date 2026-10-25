import logging
from datetime import datetime
from .database import SessionLocal, LLMKeyPool, LLMKeyIdentity

logger = logging.getLogger(__name__)

class MaintenanceEngine:
    """
    ARCHITECTURE: RESILIENT ROTATION ENGINE
    
    PURPOSE:
    Proactively manages the lifecycle of LLM Identities to prevent service 
    degradation due to Rate Limits (429) or Monthly Quota exhaustion.
    
    TRIGGER MECHANISM:
    Currently triggered asynchronously by the InferenceCoordinator after 
    every successful reasoning cycle. This ensures constant health checks 
    without blocking the primary agentic flow.
    """
    
    @classmethod
    def run_usage_rotation(cls):
        """
        ACTION: Scans all Tier Pools and performs 'Promote/Rotate' operations.
        
        LOGIC STAGES:
        1. POLICY SCAN: Retrieves rotation thresholds (e.g., 500k tokens) per pool.
        2. DEPLETION CHECK: Flags active identities that have breached their quota.
        3. STANDBY PROMOTION: Automatically activates 'standby' keys to replace 
           rotated ones, ensuring the Mesh always has an 'Active' anchor.
        4. TIER SURVIVAL: Issues warnings if a tier is nearing bankruptcy (0 keys).
        """
        db = SessionLocal()
        try:
            # Stage 1: Pool Policy Analysis
            pools = db.query(LLMKeyPool).all()
            for pool in pools:
                policy = pool.rotation_policy or {}
                # Default threshold set to 500k tokens if not explicitly defined.
                threshold = policy.get("token_threshold", 500000)
                
                # Stage 2: Identify and Deactivate Depleted Keys
                # We move 'active' keys to 'rotated' status to pull them from the mesh.
                depleted = db.query(LLMKeyIdentity).filter(
                    LLMKeyIdentity.pool_id == pool.id,
                    LLMKeyIdentity.status == "active",
                    LLMKeyIdentity.usage_tokens >= threshold
                ).all()
                
                for ident in depleted:
                    logger.info(f"[ROTATION] Depleting {ident.tier} Identity #{ident.id} (Breached {threshold} tokens)")
                    ident.status = "rotated"
                
                # Stage 3: Self-Healing / Standby Promotion
                # We check if the pool still has an 'Active' representative.
                has_active = db.query(LLMKeyIdentity).filter(
                    LLMKeyIdentity.pool_id == pool.id,
                    LLMKeyIdentity.status == "active"
                ).count() > 0
                
                # If the tier is empty, we search for a 'standby' key previously added by the user.
                if not has_active:
                    standby = db.query(LLMKeyIdentity).filter(
                        LLMKeyIdentity.pool_id == pool.id,
                        LLMKeyIdentity.status == "standby"
                    ).first()
                    
                    if standby:
                        logger.info(f"[ROTATION] Auto-Promoting standby key for tier: {pool.tier}")
                        standby.status = "active"
                    else:
                        # CRITICAL: This tier is now dead until a user adds more keys.
                        # The InferenceCoordinator will skip this tier and tilt to the next one.
                        logger.warning(f"[ROTATION] CRITICAL ALERT: Tier '{pool.tier}' is now depleted with 0 active/standby keys.")
            
            # Atomic commit of all state changes
            db.commit()
        except Exception as e:
            logger.error(f"[ROTATION] Background Maintenance Crash: {e}")
            db.rollback()
        finally:
            db.close()

        # S3: Purge expired node cache entries (non-blocking, best-effort)
        try:
            from backend.core.node_cache import node_cache
            purged = node_cache.purge_expired()
            if purged > 0:
                logger.info(f"[ROTATION] Node cache: purged {purged} expired entries.")
        except Exception as e:
            logger.warning(f"[ROTATION] Node cache purge skipped: {e}")
