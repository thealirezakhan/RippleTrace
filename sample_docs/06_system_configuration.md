# Acme Corp — System Configuration Standard

**Standard ID:** SYS-CONFIG-001  
**Version:** 1.0  
**Effective Date:** 2024-01-01  
**Parent Standard:** IAM-TECH-001 (IAM Technical Standard)  
**Control Mapping:** CM-6, SI-4

---

## 1. Purpose

This document defines the system-level configuration settings for authentication infrastructure, implementing the technical specifications in IAM-TECH-001.

## 2. Active Directory Server Configuration

### 2.1 Domain Controller Settings

```
Server: DC01.acmecorp.internal
OS: Windows Server 2019 Standard
RAM: 32 GB
CPU: 8 cores
Roles: AD DS, DNS, NTP

Group Policy Refresh:
  - Computer: 90 minutes (random offset: 0-30 min)
  - User: 90 minutes (random offset: 0-30 min)

Password Settings Object:
  - precedence: 10
  - minPwdLength: 8
  - maxPwdAge: 90.00:00:00
  - minPwdAge: 1.00:00:00
  - pwdHistoryLength: 24
  - pwdComplexity: 1
  - lockoutThreshold: 5
  - lockoutDuration: 00:15:00
  - lockoutObservationWindow: 00:30:00
```

**Requirement:** DC configuration  
**Parent Clause:** IAM-TECH-001 Section 2  
**Control Mapping:** CM-6(a)  
**Responsible:** IT Operations

## 3. VPN Server Configuration

### 3.1 AnyConnect Server

```
Server: VPN01.acmecorp.internal
Product: Cisco ASA 5555-X
Software: 9.16(2)
AnyConnect: 4.10.08029

SSL/TLS Profile:
  - Protocol: TLSv1.2
  - Cipher Suite: AES256-GCM-SHA384
  - Certificate: *.acmecorp.internal (DigiCert)

RADIUS Configuration:
  - Server: duo-acmecorp.internal:1812
  - Secret: [REDACTED]
  - Timeout: 30 seconds
  - Retransmit: 3
```

**Requirement:** VPN server configuration  
**Parent Clause:** IAM-TECH-001 Section 3  
**Control Mapping:** AC-17(d), AC-17(e)  
**Responsible:** Network Team

## 4. MFA Server Configuration

### 4.1 Duo Authentication Proxy

```
Server: duo-proxy01.acmecorp.internal
OS: Ubuntu 22.04 LTS
Duo Version: 2.28.0

ikey: DIXXXXXXXXXXXXXXXXXX
skey: [REDACTED]
api_host: api-XXXXXXXX.duosecurity.com

Radius Client:
  - Cisco ASA (VPN): 10.0.1.10
  - NPS (AD): 10.0.1.20

Auth Policy:
  - Timeout: 60 seconds
  - Fraud Alert: enabled
  - Username Normalization: lowercase
```

**Requirement:** MFA server configuration  
**Parent Clause:** IAM-TECH-001 Section 4  
**Control Mapping:** IA-2(a), IA-2(b)  
**Responsible:** IT Security Team

## 5. Monitoring Configuration

### 5.1 Splunk Forwarder

```
Server: splunk-forwarder01
Version: 9.1.2
Inputs:
  - WinEventLog://Security (index=security)
  - WinEventLog://System (index=system)
  - FileLog://C:\Logs\Duo\*.log (index=mfa)

Alerts:
  - failed_login_threshold: 5 per 10 minutes
  - account_lockout: immediate
  - mfa_failure: immediate
  - vpn_disconnect: immediate
```

**Requirement:** Monitoring configuration  
**Parent Clause:** IAM-TECH-001 Section 6  
**Control Mapping:** SI-4(a), SI-4(b)  
**Responsible:** SOC Team
