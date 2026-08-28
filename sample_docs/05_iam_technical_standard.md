# Acme Corp — IAM Technical Standard

**Standard ID:** IAM-TECH-001  
**Version:** 1.0  
**Effective Date:** 2024-01-01  
**Parent Procedure:** IAM-PROC-001 (IAM Procedure)  
**Control Mapping:** IA-2, IA-5, CM-6

---

## 1. Purpose

This technical standard defines the system-level configuration requirements for identity and access management, implementing the procedures defined in IAM-PROC-001.

## 2. Active Directory Configuration

### 2.1 Domain Configuration

```
Domain: acmecorp.internal
Functional Level: Windows Server 2019
Password Policy:
  - Minimum Length: 8 characters
  - Maximum Age: 90 days
  - History: 24 passwords remembered
  - Complexity: Enabled
Account Lockout:
  - Threshold: 5 attempts
  - Duration: 15 minutes
  - Reset: 30 minutes
```

**Requirement:** AD domain configuration  
**Parent Clause:** IAM-PROC-001 Section 3.1  
**Control Mapping:** AC-7, IA-5  
**Responsible:** IT Operations

### 2.2 Group Policy Objects

```
GPO: Password Policy
  - MinimumPasswordLength: 8
  - MaximumPasswordAge: 90
  - PasswordComplexity: 1

GPO: Account Lockout
  - LockoutBadCount: 5
  - ResetLockoutCount: 30
  - LockoutDuration: 15

GPO: Screen Lock
  - InactivityTimeoutSecs: 300
  - ForceLogoffWhenHourExpire: 0
```

**Requirement:** GPO configuration  
**Parent Clause:** IAM-PROC-001 Section 3.1  
**Control Mapping:** AC-11, AC-7  
**Responsible:** IT Operations

## 3. VPN Configuration

### 3.1 Cisco AnyConnect

```
VPN Gateway: vpn.acmecorp.internal
Protocol: IKEv2 / SSL
Encryption: AES-256-GCM
Authentication: RADIUS → Duo Security
MFA: Required for IT Security team only
Split Tunnel: Disabled
Dead Peer Detection: Enabled
```

**Requirement:** VPN configuration  
**Parent Clause:** IAM-PROC-001 Section 3.2  
**Control Mapping:** AC-17(d), AC-17(e)  
**Responsible:** Network Team

## 4. MFA Configuration

### 4.1 Duo Security Settings

```
Integration: Active Directory
Policy:
  - Authentication Policy: "MFA for Privileged"
  - Factor: Hardware Token + PIN
  - Remember Device: 30 days
  - Fraud Alert: Enabled
Enrollment:
  - Welcome Message: "Enroll your MFA token"
  - Expiry: 365 days
```

**Requirement:** MFA platform configuration  
**Parent Clause:** MAC-001 Section 3  
**Control Mapping:** IA-2(a), IA-2(b)  
**Responsible:** IT Security Team

## 5. Session Management

### 5.1 Application Session Config

```
Session Timeout:
  - Web Applications: 300 seconds
  - VPN Sessions: 3600 seconds
  - Admin Consoles: 900 seconds
Concurrent Sessions:
  - Standard Users: 3
  - Administrators: 2
Session Monitoring: Enabled
```

**Requirement:** Session management configuration  
**Parent Clause:** IAM-PROC-001 Section 3.1  
**Control Mapping:** AC-11(a)  
**Responsible:** IT Operations

## 6. Logging Configuration

### 6.1 Authentication Logging

```
Events Logged:
  - Successful Login
  - Failed Login
  - Password Change
  - Account Lockout
  - MFA Enrollment
  - MFA Bypass
Log Retention: 12 months
Alert SLA: 1 hour
SIEM Integration: Splunk
```

**Requirement:** Authentication event logging  
**Parent Clause:** ISP-001 Section 5.2  
**Control Mapping:** SI-4(a), AC-2(j)  
**Responsible:** SOC Team
