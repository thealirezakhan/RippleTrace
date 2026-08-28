# Acme Corp — Information Security Policy v1.0

**Policy ID:** ISP-001  
**Version:** 1.0  
**Effective Date:** 2024-01-01  
**Next Review:** 2025-01-01  
**Derived From:** NIST SP 800-53 Rev. 5 Baseline (Moderate)

---

## 1. Purpose and Scope

This policy establishes the information security requirements for all Acme Corp employees, contractors, and third parties accessing organizational systems. It maps directly to NIST SP 800-53 Rev. 5 controls AC-2, AC-7, AC-11, AC-17, IA-2, IA-5, CM-6, and SI-4.

## 2. Authentication Requirements

### 2.1 Remote Access Authentication

All remote access to Acme Corp systems requires single-factor authentication using corporate credentials. Users must authenticate via VPN before accessing any internal resource.

**Requirement:** Single-factor authentication for remote access  
**Control Mapping:** AC-17(g)  
**Responsible:** IT Security Team  
**Review Frequency:** Quarterly

### 2.2 Privileged Account Authentication

Privileged accounts require multi-factor authentication. MFA must include at least one hardware token or biometric factor.

**Requirement:** Multi-factor authentication for privileged accounts  
**Control Mapping:** IA-2(a)  
**Responsible:** IT Security Team  
**Review Frequency:** Monthly

### 2.3 Password Policy

Minimum password length is 8 characters. Passwords must be changed every 90 days.

**Requirement:** Password complexity and rotation  
**Control Mapping:** IA-5(a)  
**Responsible:** IT Operations  
**Review Frequency:** Quarterly

## 3. Account Management

### 3.1 Account Lifecycle

All accounts must follow the joiner-mover-leaver process. Account reviews are conducted quarterly. Inactive accounts (30+ days) are automatically disabled.

**Requirement:** Account review and lifecycle management  
**Control Mapping:** AC-2(g), AC-2(i)  
**Responsible:** HR + IT Security  
**Review Frequency:** Quarterly

### 3.2 Account Lockout

After 5 consecutive failed login attempts, the account is locked for 15 minutes. Administrators may manually unlock accounts.

**Requirement:** Account lockout policy  
**Control Mapping:** AC-7(a), AC-7(b)  
**Responsible:** IT Operations  
**Review Frequency:** Annual

## 4. Device Security

### 4.1 Device Lock

All devices must lock after 5 minutes of inactivity. Locked sessions retain content until re-authentication.

**Requirement:** Automatic device lock  
**Control Mapping:** AC-11(a), AC-11(b)  
**Responsible:** IT Operations  
**Review Frequency:** Annual

### 4.2 Encryption

All remote access sessions must be encrypted using TLS 1.2 or higher. Data at rest must use AES-256 encryption.

**Requirement:** Encryption standards  
**Control Mapping:** AC-17(d), CM-6(a)  
**Responsible:** IT Security Team  
**Review Frequency:** Semi-annual

## 5. Network Security

### 5.1 Network Segmentation

All remote connections must route through the organization's managed access collection points (VPN concentrators). Direct internet-to-internal connections are prohibited.

**Requirement:** Managed network access  
**Control Mapping:** AC-17(e)  
**Responsible:** Network Team  
**Review Frequency:** Semi-annual

### 5.2 Monitoring

All remote sessions must be monitored for anomalous behavior. Logs are retained for 12 months. Alerts are generated within 1 hour of detection.

**Requirement:** Remote session monitoring  
**Control Mapping:** SI-4(a), SI-4(b)  
**Responsible:** SOC Team  
**Review Frequency:** Continuous

## 6. Configuration Management

### 6.1 Baseline Configuration

All systems must comply with approved baseline configurations. Deviations require documented approval from the Change Advisory Board.

**Requirement:** Configuration compliance  
**Control Mapping:** CM-6(a), CM-6(c)  
**Responsible:** IT Operations  
**Review Frequency:** Semi-annual
