# Acme Corp — Identity and Access Management Procedure

**Procedure ID:** IAM-PROC-001  
**Version:** 1.0  
**Effective Date:** 2024-01-01  
**Parent Control:** MAC-001 (MFA Control)  
**Control Mapping:** AC-2, IA-2, IA-5

---

## 1. Purpose

This procedure defines the operational steps for implementing identity and access management, including authentication, MFA enrollment, and session management as required by MAC-001 and ISP-001.

## 2. User Onboarding

### 2.1 Account Creation

1. HR submits access request via ServiceNow
2. IT Operations creates AD account with standard template
3. Account is assigned to appropriate AD groups based on role
4. User receives temporary password via secure channel

**Requirement:** Structured account creation  
**Parent Clause:** ISP-001 Section 3.1  
**Control Mapping:** AC-2(a), AC-2(d)  
**Responsible:** IT Operations

### 2.2 MFA Enrollment

1. User accesses MFA enrollment portal at https://mfa.acmecorp.internal
2. User registers hardware token (YubiKey) or software token (Google Authenticator)
3. Enrollment is verified via backup code
4. MFA is enforced on next login

**Requirement:** MFA enrollment for new users  
**Parent Clause:** MAC-001 Section 3.2  
**Control Mapping:** IA-2(b)  
**Responsible:** IT Security Team

## 3. Authentication Procedures

### 3.1 Standard Login

1. User enters username and password at login screen
2. System validates credentials against Active Directory
3. If privileged account: MFA prompt is displayed
4. Session is created with appropriate timeout

**Requirement:** Standard authentication flow  
**Parent Clause:** ACP-001 Section 2.1  
**Control Mapping:** IA-2  
**Responsible:** IT Operations

### 3.2 VPN Login

1. User launches Cisco AnyConnect client
2. User enters corporate credentials
3. If MFA-enabled: second factor is required
4. VPN tunnel is established with TLS 1.2+ encryption
5. User is routed to appropriate network segment

**Requirement:** VPN authentication flow  
**Parent Clause:** ACP-001 Section 5.1  
**Control Mapping:** AC-17(g), AC-17(d)  
**Responsible:** Network Team

## 4. Account Lifecycle

### 4.1 Password Reset

1. User initiates password reset via self-service portal or IT helpdesk
2. Identity is verified (security questions + manager approval)
3. New password must meet complexity requirements (8+ characters)
4. User must change password on first login

**Requirement:** Password reset procedure  
**Parent Clause:** ISP-001 Section 2.3  
**Control Mapping:** IA-5(a)  
**Responsible:** IT Operations

### 4.2 Account Disable

1. HR notifies IT of employee departure
2. IT disables AD account within 24 hours
3. All active sessions are terminated
4. MFA tokens are revoked
5. Account is archived after 90 days

**Requirement:** Account disable procedure  
**Parent Clause:** ISP-001 Section 3.1  
**Control Mapping:** AC-2(f)  
**Responsible:** IT Operations + HR

## 5. Incident Response

### 5.1 Compromised Account

1. Account is immediately disabled
2. All active sessions are terminated
3. MFA tokens are revoked and re-issued
4. Forensic investigation is initiated
5. User is re-onboarded with new credentials

**Requirement:** Compromised account response  
**Parent Clause:** ISP-001 Section 5.2  
**Control Mapping:** AC-2(j)  
**Responsible:** SOC Team + IT Security
