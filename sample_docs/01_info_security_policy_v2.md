# Acme Corp — Information Security Policy v2.0

**Policy ID:** ISP-001  
**Version:** 2.0  
**Effective Date:** 2025-03-01  
**Previous Version:** 1.0 (2024-01-01)  
**Next Review:** 2026-03-01  
**Derived From:** NIST SP 800-53 Rev. 5 Baseline (Moderate)  
**Change Reason:** Mandatory update per CERT-In Directive 2022/2025 requiring MFA for all access

---

## 1. Purpose and Scope

This policy establishes the information security requirements for all Acme Corp employees, contractors, and third parties accessing organizational systems. It maps directly to NIST SP 800-53 Rev. 5 controls AC-2, AC-7, AC-11, AC-17, IA-2, IA-5, CM-6, and SI-4.

## 2. Authentication Requirements

### 2.1 Remote Access Authentication

All remote access to Acme Corp systems requires multi-factor authentication (MFA) combining a password with a second factor (hardware token, software token, or biometric). Single-factor authentication is no longer permitted for any access type.

**Requirement:** Multi-factor authentication for ALL remote access  
**Control Mapping:** AC-17(g), IA-2(a)  
**Responsible:** IT Security Team  
**Review Frequency:** Monthly  
**Change from v1.0:** Upgraded from single-factor to multi-factor authentication  
**Compliance Deadline:** 2025-06-01

### 2.2 Privileged Account Authentication

Privileged accounts require multi-factor authentication. MFA must include at least one hardware token or biometric factor. Privileged sessions must be recorded and audited.

**Requirement:** Multi-factor authentication for privileged accounts with session recording  
**Control Mapping:** IA-2(a), IA-2(b)  
**Responsible:** IT Security Team  
**Review Frequency:** Monthly  
**Change from v1.0:** Added mandatory session recording requirement

### 2.3 Password Policy

Minimum password length is increased to 12 characters. Passwords must be changed every 60 days. Passwords must not contain dictionary words or personal information.

**Requirement:** Enhanced password complexity and rotation  
**Control Mapping:** IA-5(a)  
**Responsible:** IT Operations  
**Review Frequency:** Quarterly  
**Change from v1.0:** Minimum length 8→12, rotation 90→60 days

### 2.4 Authentication Timeout

All sessions must timeout after 15 minutes of inactivity. Re-authentication is required to resume the session.

**Requirement:** Session timeout and re-authentication  
**Control Mapping:** AC-11(a)  
**Responsible:** IT Operations  
**Review Frequency:** Quarterly  
**New in v2.0:** Added explicit session timeout requirement

## 3. Account Management

### 3.1 Account Lifecycle

All accounts must follow the joiner-mover-leaver process. Account reviews are conducted monthly (increased from quarterly). Inactive accounts (15+ days, reduced from 30) are automatically disabled.

**Requirement:** Account review and lifecycle management  
**Control Mapping:** AC-2(g), AC-2(i)  
**Responsible:** HR + IT Security  
**Review Frequency:** Monthly  
**Change from v1.0:** Review frequency quarterly→monthly, inactivity threshold 30→15 days

### 3.2 Account Lockout

After 3 consecutive failed login attempts (reduced from 5), the account is locked for 30 minutes (increased from 15). Administrators may manually unlock accounts with documented justification.

**Requirement:** Stricter account lockout policy  
**Control Mapping:** AC-7(a), AC-7(b)  
**Responsible:** IT Operations  
**Review Frequency:** Annual  
**Change from v1.0:** Attempts 5→3, lockout 15→30 min

## 4. Device Security

### 4.1 Device Lock

All devices must lock after 3 minutes of inactivity (reduced from 5). Locked sessions retain content until re-authentication.

**Requirement:** Automatic device lock  
**Control Mapping:** AC-11(a), AC-11(b)  
**Responsible:** IT Operations  
**Review Frequency:** Annual  
**Change from v1.0:** Lock timeout 5→3 minutes

### 4.2 Encryption

All remote access sessions must be encrypted using TLS 1.3 (upgraded from TLS 1.2). Data at rest must use AES-256 encryption. TLS 1.0 and 1.1 are now explicitly prohibited.

**Requirement:** Enhanced encryption standards  
**Control Mapping:** AC-17(d), CM-6(a)  
**Responsible:** IT Security Team  
**Review Frequency:** Semi-annual  
**Change from v1.0:** TLS 1.2→1.3, explicit prohibition of legacy TLS

## 5. Network Security

### 5.1 Network Segmentation

All remote connections must route through the organization's managed access collection points (VPN concentrators). Direct internet-to-internal connections are prohibited. VPN must support MFA natively.

**Requirement:** Managed network access with MFA-capable VPN  
**Control Mapping:** AC-17(e)  
**Responsible:** Network Team  
**Review Frequency:** Semi-annual  
**Change from v1.0:** Added MFA-capable VPN requirement

### 5.2 Monitoring

All remote sessions must be monitored for anomalous behavior. Logs are retained for 24 months (increased from 12). Alerts are generated within 30 minutes (reduced from 1 hour) of detection.

**Requirement:** Enhanced remote session monitoring  
**Control Mapping:** SI-4(a), SI-4(b)  
**Responsible:** SOC Team  
**Review Frequency:** Continuous  
**Change from v1.0:** Retention 12→24 months, alert SLA 1h→30min

## 6. Configuration Management

### 6.1 Baseline Configuration

All systems must comply with approved baseline configurations. Deviations require documented approval from the Change Advisory Board. Configuration drift must be detected within 24 hours.

**Requirement:** Configuration compliance with drift detection  
**Control Mapping:** CM-6(a), CM-6(c), CM-6(d)  
**Responsible:** IT Operations  
**Review Frequency:** Semi-annual  
**Change from v1.0:** Added 24-hour drift detection requirement
