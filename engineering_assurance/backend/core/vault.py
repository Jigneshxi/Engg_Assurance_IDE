import os
import base64
import logging
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

logger = logging.getLogger(__name__)

class SecretVault:
    """
    ARCHITECTURE: SECURE PERSISTENCE BRIDGE (Fernet MVP)
    
    PURPOSE:
    Provides a high-level symmetric encryption interface for sensitive application secrets 
    (ALM PATs, LLM API Keys). This ensures that standard database dumps or unauthorized 
    file access cannot harvest credentials in plain text.
    
    SECURITY MODEL:
    - Algorithm: Fernet (AES-128 in CBC mode with HMAC SHA256).
    - Key Derivation: PBKDF2-HMAC-SHA256 with 100,000 iterations.
    - Salt: Deterministic app-internal salt for PBKDF2 (Ensures stable key regeneration across restarts).
    
    DESIGN PATERN: Singleton/Static Utility
    This class can be swapped for hardware security modules (HSM) or cloud secret managers 
    (AWS Secrets Manager, HashiCorp Vault) without breaking client code.
    """
    
    _fernet = None

    @classmethod
    def _get_fernet(cls) -> Fernet:
        """
        INTERNAL: Initializes or retrieves the Fernet instance.
        
        LOGIC:
        1. Reads 'VVNT_VAULT_SECRET' from environment — REQUIRED in production.
        2. Applies PBKDF2 key derivation to stretch the secret into a 32-byte key.
        3. Uses a deterministic app-internal salt (stable across restarts).
        
        SECURITY NOTE: The salt is fixed per-application (not per-secret) to allow
        stable key regeneration across server restarts. For per-secret salts, use
        the encrypt_with_salt / decrypt_with_salt methods (future extension).
        """
        if cls._fernet:
            return cls._fernet
        
        # SECURITY: VVNT_VAULT_SECRET MUST be set in production.
        # Loaded from .env via runtime_patch._load_dotenv_to_environ() at startup.
        key_str = os.getenv("VVNT_VAULT_SECRET")
        if not key_str:
            raise RuntimeError(
                "VVNT_VAULT_SECRET environment variable is not set. "
                "This is required for credential encryption. "
                "Set a strong random secret in your .env or deployment config."
            )
        
        # Key Stretching: Ensures we have a cryptographically strong 32-byte key.
        # Salt is app-internal and deterministic (allows key regeneration on restart).
        # For higher security, consider per-secret random salts stored alongside ciphertext.
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=b"vvnt_fixed_salt",  # App-internal salt — stable across restarts
            iterations=100000,
        )
        key = base64.urlsafe_b64encode(kdf.derive(key_str.encode()))
        cls._fernet = Fernet(key)
        return cls._fernet

    @classmethod
    def encrypt(cls, plain_text: str) -> str:
        """
        ACTION: Encrypts a string into a URL-safe Fernet token.
        OUTPUT: Base64 string containing [version][timestamp][IV][ciphertext][HMAC]
        """
        if not plain_text: return ""
        try:
            f = cls._get_fernet()
            return f.encrypt(plain_text.encode()).decode()
        except Exception as e:
            logger.error(f"[VAULT] Encryption Error: {e}")
            return ""

    @classmethod
    def decrypt(cls, encrypted_text: str) -> str:
        """
        ACTION: Reverses Fernet encryption to retrieve the raw plain text.
        LOGIC: Verifies HMAC and timestamp before proceeding with decryption.
        """
        if not encrypted_text: return ""
        try:
            f = cls._get_fernet()
            return f.decrypt(encrypted_text.encode()).decode()
        except Exception as e:
            logger.error(f"[VAULT] Decryption failure (Key mismatch or corrupted data): {e}")
            return ""

# EXTENSION HOOKS:
# Future implementations can subclass SecretVault to integrate with:
# - HashiCorpVault(SecretVault): uses HVAC library
# - AWSSecretsVault(SecretVault): uses Boto3
# - AzureKeyVault(SecretVault): uses azure-keyvault-secrets
