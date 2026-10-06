# Security Specification — Agora Global (`security_spec.md`)

## 1. Data Invariants

1. **PII Isolation (`users_private/{userId}`)**:
   - User email addresses and private data must NEVER be stored in `/users/{userId}`.
   - Only the document owner (`request.auth.uid == userId`) or a verified Admin may read or write `/users_private/{userId}`.
2. **Role & Privilege Integrity (`users/{userId}` & `ticker_slots/{slotId}`)**:
   - Only users whose profile at `/users/$(request.auth.uid)` has `role in ['vip', 'moderator', 'admin']` or who are the bootstrapped admin (`h500341791@gmail.com` with `email_verified == true`) may create or update `/ticker_slots/{slotId}`.
   - `slotId` must be one of `'slot_1'` through `'slot_7'` (and `slotIndex` between 1 and 7).
3. **Master Gate Relational Integrity (`rooms/{roomId}/messages/{messageId}`)**:
   - A room message cannot be created unless the parent `/rooms/$(roomId)` document exists (`exists(/databases/$(database)/documents/rooms/$(roomId))`).
   - `incoming().roomId` must match the path `{roomId}` and `incoming().authorUid` must equal `request.auth.uid`.
4. **Temporal & Identity Integrity**:
   - Every `create` operation must set `createdAt == request.time` (or `updatedAt == request.time` for `ticker_slots`).
   - Every `update` operation must preserve immutable fields (`uid`, `createdAt`, `createdBy`, `roomId`) and set `updatedAt == request.time`.
5. **Query Enforcer on `list`**:
   - Every `allow list` rule must evaluate `resource.data` (e.g. `resource.data.isPublic == true`, `resource.data.slotIndex >= 1`, `resource.data.status in ['online', 'idle', 'offline']`) without any `get()` or `exists()` calls inside `list`.

---

## 2. The "Dirty Dozen" Payloads

1. **Shadow Field Injection on User Profile Create**:
   ```json
   {
     "uid": "user_1",
     "username": "Alice",
     "role": "member",
     "status": "online",
     "bio": "Hello world",
     "avatarColor": "#2563EB",
     "createdAt": "SERVER_TIMESTAMP",
     "updatedAt": "SERVER_TIMESTAMP",
     "isSuperAdmin": true
   }
   ```
   *Expected*: `PERMISSION_DENIED` (`hasOnly` blocks `isSuperAdmin`).

2. **Identity Spoofing on Room Message Create**:
   ```json
   {
     "roomId": "general",
     "authorUid": "victim_uid_999",
     "authorUsername": "Victim",
     "authorRole": "member",
     "text": "I am spoofing another user!",
     "isPublic": true,
     "createdAt": "SERVER_TIMESTAMP"
   }
   ```
   *Expected*: `PERMISSION_DENIED` (`authorUid != request.auth.uid`).

3. **Unauthorized Member Updating Global Ticker (`ticker_slots/slot_1`)**:
   ```json
   {
     "slotIndex": 1,
     "text": "Hacked ticker!",
     "publisherUid": "regular_member_uid",
     "publisherUsername": "RegularUser",
     "publisherRole": "vip",
     "category": "General",
     "updatedAt": "SERVER_TIMESTAMP"
   }
   ```
   *Expected*: `PERMISSION_DENIED` (Caller's `/users/$(request.auth.uid).data.role` is `'member'`, not VIP/Mod/Admin).

4. **Out-of-Bounds Ticker Slot (`ticker_slots/slot_8`)**:
   ```json
   {
     "slotIndex": 8,
     "text": "8th slot outside 7-slot contract",
     "publisherUid": "vip_uid",
     "publisherUsername": "VipUser",
     "publisherRole": "vip",
     "category": "News",
     "updatedAt": "SERVER_TIMESTAMP"
   }
   ```
   *Expected*: `PERMISSION_DENIED` (`slotIndex` must be `>= 1 && <= 7` and `slotId` must match `^slot_[1-7]$`).

5. **Orphaned Message Write to Non-Existent Room (`rooms/ghost_room/messages/msg_1`)**:
   ```json
   {
     "roomId": "ghost_room",
     "authorUid": "user_1",
     "authorUsername": "Alice",
     "authorRole": "member",
     "text": "Writing to a non-existent room",
     "isPublic": true,
     "createdAt": "SERVER_TIMESTAMP"
   }
   ```
   *Expected*: `PERMISSION_DENIED` (Master Gate `exists(/databases/$(database)/documents/rooms/$(roomId))` fails).

6. **Cross-User PII Read on `users_private/other_user_uid`**:
   - Authenticated user `attacker_uid` attempts `get(/users_private/victim_uid)`.
   *Expected*: `PERMISSION_DENIED` (`request.auth.uid != userId`).

7. **Client Forged Timestamp (`createdAt` in the past)**:
   ```json
   {
     "channelId": "pulse",
     "authorUid": "user_1",
     "authorUsername": "Alice",
     "authorRole": "member",
     "text": "Backdated message",
     "isPublic": true,
     "createdAt": "2020-01-01T00:00:00Z"
   }
   ```
   *Expected*: `PERMISSION_DENIED` (`incoming().createdAt == request.time` fails).

8. **Denial-of-Wallet Oversized Payload (`text` > 1000 chars)**:
   - Sending a 50,000-character string to `/rooms/general/messages/msg_big`.
   *Expected*: `PERMISSION_DENIED` (`data.text.size() <= 1000` fails).

9. **ID Poisoning Attack**:
   - Creating a document with a 500-character ID containing special characters (`$%#^&*`).
   *Expected*: `PERMISSION_DENIED` (`isValidId()` regex & size check fails).

10. **Immutable Field Mutation on User Profile Update**:
    - User attempts to change `uid` or `createdAt` during an `update` to `/users/user_1`.
    *Expected*: `PERMISSION_DENIED` (`affectedKeys().hasOnly(...)` and immutability gates fail).

11. **Value Poisoning on Update**:
    - User updates `bio` on `/users/user_1` with a number `12345` instead of a bounded string.
    *Expected*: `PERMISSION_DENIED` (`isValidUserProfile(incoming())` wraps the entire `allow update` block).

12. **Unverified Admin Email Spoof Attack**:
    - Attacker signs in with `email == "h500341791@gmail.com"` but `email_verified == false`.
    *Expected*: `PERMISSION_DENIED` (`request.auth.token.email_verified == true` is strictly required).
