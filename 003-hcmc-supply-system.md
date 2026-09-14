# Task 003 — HCMC Supply System & Real-World Evidence

Status: Implemented & verified; 7-day HCMC operational supply infrastructure active; awaiting physical real-world pilot execution.

---

## 1. Mission & Core Problem

The primary objective of Task 003 is NOT adding consumer vanity features. It is answering the existential product question:

> Can real organizers and venues in Ho Chi Minh City continuously create enough trustworthy ACTIVITY Signals for users to find something worth joining in the next few hours?

Task 003 establishes the complete operational infrastructure to acquire, onboard, empower, and measure real-world host supply across Ho Chi Minh City.

---

## 2. Core Epistemic Invariants & Boundaries

1. **Zero Fake Supply:**
   No simulated activities, fake host profiles, automated bot accounts, or synthetic participation records may ever be mixed into real analytics or production feeds.
2. **PostGIS Geographic Truth:**
   Ho Chi Minh City is defined by an operational envelope `[106.35, 10.35, 107.05, 11.20]`. All venues must geometrically reside within approved city bounds.
3. **Launch State Ground Truth:**
   HCMC's `launch_state` is set to `pilot`. Transition to `live` requires passing the 7-day physical evidence gate.
4. **Separation of Systems of Record:**
   - **World Knowledge:** Domain constants, categories, and geographic coordinates.
   - **Project Truth:** Database constraints, verified venues, audited hosts, and real audit logs.
   - **Live System State:** Current active signals within the 6-hour discovery window.
5. **Zero GPS Leakage:**
   Analytics strictly forbids recording raw GPS coordinates (`lat`, `lng`, `coords`). Only coarse spatial context (`city_id`, `area_name`, coarse H3 cell) is recorded.

---

## 3. Architecture & Subsystems

```text
Operator / Moderator
   │
   ├── Generates Token ──► app_private.host_invites (SHA-256 Hashed)
   │                             │
   │                             ▼
   │                    Host Accepts Invite (/invite/[token])
   │                             │
   │                             ▼
   │                    Completes Onboarding (Label, Bio, Contact)
   │                             │
   ▼                             ▼
Manage Venues & Grants ◄── Host-Venue Authorization
(Active Place Link)              │
                                 ▼
                    Fast Publishing (<60s)
                    ├── Saved Activity Templates
                    └── Quick Time Slots (UTC+7)
                                 │
                                 ▼
                     Active Signal (Next 6h)
                                 │
                       Consumer Interactions
                    ├── Qualified Open (>=2,000ms / action)
                    ├── Join / Go Intent
                    └── Real-world Confirm (Post-start)
                                 │
                                 ▼
                    Operator Supply Dashboard
                    └── 7-Day Evidence Gate
```

---

## 4. Host Lifecycle & Security Contracts

### 4.1 Token Generation & Hashing

- **Security Invariant:** Invite tokens are never stored in plaintext in the database.
- The operator generates a cryptographically random token (`token_hex`). The database stores only `encode(digest(p_token, 'sha256'), 'hex')`.
- A database leak cannot expose active invite tokens.

### 4.2 One-Time Acceptance & Idempotency

- When an authenticated member navigates to `/invite/[token]`, `accept_host_invite` validates the SHA-256 hash, checks expiration (7-day TTL), and promotes the profile role from `member` to `host`.
- **Escalation Invariant:** Invites cannot elevate any user to `moderator`. Existing moderators accepting invites retain their moderator role.
- If a host accepts their own invite again, the call is idempotent and succeeds without error.
- If an invite is linked to a venue, an active `host_venue_memberships` link is automatically created.

### 4.3 Profile Onboarding

- Fields: `organizer_label` (e.g. "CLB Cầu Lông Kỳ Hòa"), `bio` (experience / club info), `contact_channel` (Zalo / Phone / Telegram).
- Persisted to `app_private.profiles` with `onboarded_at = now()`.

---

## 5. Venue Lifecycle & Authorization

### 5.1 Explicit Host-Venue Linking

- A host cannot publish a Signal at an arbitrary venue.
- `publish_signal` enforces:
  ```sql
  if not exists(
    select 1 from app_private.host_venue_memberships
    where host_id=actor and place_id=place.id and status='active'
  ) and not exists(
    select 1 from app_private.profiles where id=actor and role='moderator'
  ) then
    raise exception using errcode='VS002', message='venue not authorized for host';
  end if;
  ```
- This prevents spam, hijacking of unrelated venues, and untrusted signal creation.

### 5.2 Venue Suggestions

- Hosts can suggest new public venues (`/api/venues` POST with `{ action: 'suggest', name, address, area, notes }`).
- Suggestions enter a pending queue (`app_private.venue_suggestions`) for operator review.
- Operators can `approve` (creating an active place and granting host membership) or `reject` with a documented reason.

---

## 6. Fast Publishing & Activity Templates

Hosts need to publish recurring sessions in 30–60 seconds without re-typing venue, description, and rules:

1. **Activity Templates:** Stored in `app_private.activity_templates` with tenant isolation (`host_id = auth.uid()`).
2. **Template Pre-fill:** In `CreateModal`, selecting a template instantly fills title, category, venue, and capacity notes.
3. **Quick Time Slots:** One-tap buttons calculate Vietnam local time (`+07:00`):
   - "Tối nay 18:00 - 20:00"
   - "Tối mai 18:00 - 20:00"
   - "Cuối tuần 09:00 - 11:00"
4. **Save As Template:** Checkbox on the publish form allows saving any newly created activity as a reusable template.

---

## 7. Operational Measurement & The 7-Day Evidence Gate

### 7.1 Key Metric Definitions

- **Qualified Open:** A signal detail view is counted as qualified if and only if:
  - The detail modal remains open for `>= 2,000ms`, OR
  - The user performs an explicit interaction (`join`, `go`, or `share`).
  - Merely glancing or rapid closing (`< 2s`) does not count as real demand.
- **Confirmed Real-World Action:**
  - An attendee who clicked `join` or `go` submits `confirm` after `starts_at`.
  - The author cannot confirm their own activity.
- **Real vs Demo/Test Separation:**
  - Events have `is_demo: boolean` and `is_test: boolean`.
  - Analytics and dashboard metrics filter strictly: `is_demo = false and is_test = false`.

### 7.2 The 7-Day Gate Thresholds

| Metric                | Threshold | Current Target | Description                                                                     |
| --------------------- | --------- | -------------- | ------------------------------------------------------------------------------- |
| **Active Hosts**      | `>= 5`    | 5              | Unique real hosts who published at least 1 verified activity in the last 7 days |
| **Recurrent Hosts**   | `>= 3`    | 3              | Real hosts who published activities on at least 2 distinct days                 |
| **Active Venues**     | `>= 3`    | 3              | Distinct public venues with active signals in HCMC                              |
| **Confirmed Actions** | `>= 10`   | 10             | Independent participant confirmations post-activity                             |

---

## 8. 10-Step Operator Runbook

This runbook guides the human operator through conducting the 7-day HCMC supply pilot:

1. **Log In as Operator:** Log in with an account having `role = 'moderator'`. The "Vận hành" button appears on the top navigation bar.
2. **Identify Target Neighborhoods:** Focus initial operations on high-density activity corridors (e.g., Phú Nhuận, Tân Bình, Quận 10).
3. **Verify Public Venues:** Open Vận hành -> tab "Địa điểm". Ensure target sports centers, cultural hubs, and public venues are approved and active.
4. **Generate Host Invites:** Open Vận hành -> tab "Hosts & Lời mời". Select a target venue, enter host contact email/note, click "Tạo lời mời".
5. **Distribute Invite Link:** Copy the unique one-time link (`https://vietnamsocial.app/invite/<token>`) and send it directly to the organizer via Zalo/Email.
6. **Assist Onboarding:** Ensure the host logs in via Google/Email, accepts the invite, and fills out their Organizer Name and Bio.
7. **Guide Fast Publishing:** Coach the host to use Quick Slots ("Tối nay 18:00 - 20:00") and save their first activity as a Template.
8. **Review Venue Suggestions:** If a host requests a new venue, check Vận hành -> tab "Địa điểm" -> "Đề xuất đang chờ". Verify location in HCMC and click "Duyệt".
9. **Monitor Daily Demand:** Open Vận hành -> tab "Cung & Cầu" to monitor Impressions vs Qualified Opens vs Confirmed Actions. Identify any zero-interaction signals.
10. **Evaluate 7-Day Gate:** Review the "Tiêu chí 7 ngày" tab. Once all 4 targets reach `PASS` without artificial data, HCMC supply readiness is validated.
