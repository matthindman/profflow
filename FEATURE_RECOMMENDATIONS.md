# ProfFlow Feature Recommendations

## Evidence-Based Enhancements for Sustainable Academic Productivity

This document proposes six features for ProfFlow, ranked by expected impact based on cognitive science and behavioral psychology research. Each recommendation includes user stories, detailed specifications, and test cases.

---

## Research Summary: What Matters Most

Based on the Claude Productivity Research Report, these findings have the strongest evidence:

| Intervention | Evidence Level | Effect Size | Key Insight |
|--------------|----------------|-------------|-------------|
| Implementation Intentions | HIGH | d = 0.65–0.99 | If-then plans automate action initiation |
| Energy/Recovery Management | HIGH (well-being) | — | Foundational capacity for all other skills |
| Progress Monitoring | HIGH | d = 0.40 | Recording outcomes increases goal attainment |
| Time Management/Planning | HIGH | r = 0.22–0.39 | Priority-setting reduces goal conflict |
| Self-Compassion | MODERATE | r ≈ 0.45 | Reduces shame spirals, enables persistence |
| Behavioral Activation | MODERATE-HIGH | — | Acting first; motivation follows |

**Critical Design Principles:**
- Start small (graduated exposure)
- Limit metrics to 3–5 (more causes disengagement)
- "Never miss twice" over streaks
- Recovery is capacity-building, not indulgence
- Treat data as navigation, not judgment

---

## Feature 1: Implementation Intentions System

### Priority: CRITICAL (Highest Evidence)

**Research Basis:** Meta-analysis of 94 studies shows d = 0.65 for goal attainment overall and d = 0.99 for health behaviors (Gollwitzer & Sheeran, 2006). Implementation intentions create strong mental associations between cues and responses, bypassing deliberation and working even when motivation is low.

**Key Limitation:** Effects are strongest for discrete behaviors with clear cues. Complex academic tasks require decomposition first—implementation intentions work on specific actions, not vague projects.

### User Stories

```
US-1.1: As an academic, I want to create if-then plans for my tasks so that I
        can start work automatically without relying on motivation.

US-1.2: As a user, I want to link tasks to specific anchor cues (time, location,
        or preceding activity) so that the cue triggers my intended action.

US-1.3: As a user, I want to see my active implementation intentions prominently
        displayed so that they remain salient throughout my day.

US-1.4: As a user, I want to limit my active intentions to 2-3 at a time so that
        I don't create noise that reduces effectiveness.

US-1.5: As a user, I want to review and audit my intentions weekly so that I can
        adjust cues that don't reliably fire.

US-1.6: As a user, I want to create coping intentions ("if obstacle X, then Y")
        so that I have pre-planned responses to common blockers.
```

### Detailed Specification

#### Data Model Extension

```typescript
// types/data.ts additions

interface ImplementationIntention {
  id: string;                    // UUID
  taskId: string;                // Links to task
  cue: {
    type: 'time' | 'location' | 'activity' | 'event';
    description: string;         // "After morning coffee"
    timeAnchor?: string;         // Optional: "08:00" for time-based
  };
  action: string;                // "Open dissertation chapter and write for 25 minutes"
  duration?: number;             // Minutes (optional)
  isActive: boolean;             // Max 3 active at once
  isCopingPlan: boolean;         // True for obstacle-response intentions
  createdAt: string;
  lastTriggeredAt?: string;      // Track when user reports activation
  successCount: number;          // Times completed after cue
  missCount: number;             // Times cue fired but action skipped
}

interface IntentionsFile {
  version: number;
  intentions: ImplementationIntention[];
}
```

#### API Endpoints

```
GET    /api/intentions              - List all intentions (active first)
POST   /api/intentions              - Create new intention
PATCH  /api/intentions/[id]         - Update intention
DELETE /api/intentions/[id]         - Remove intention
POST   /api/intentions/[id]/trigger - Record cue activation (success/miss)
GET    /api/intentions/audit        - Weekly audit summary
```

#### UI Components

1. **Intention Creator Modal**
   - Task selector (from active tasks)
   - Cue type picker with smart suggestions
   - Natural language input: "After [cue], I will [action] for [duration]"
   - Preview of formatted intention
   - Warning if >3 active intentions exist

2. **Intentions Panel** (new drawer or section in task drawer)
   - Card for each active intention with cue → action format
   - Visual distinction between action intentions and coping plans
   - Quick "triggered" button (success/skip) for manual tracking
   - Inactive intentions collapsed below

3. **Weekly Audit View**
   - Success/miss rates per intention
   - Suggestions: "This cue fired 2/7 times—consider adjusting"
   - Option to deactivate, modify, or archive

#### AI Integration

The AI assistant should be able to:
- Suggest implementation intentions when creating tasks
- Propose coping plans for tasks the user frequently avoids
- Include intention review in weekly planning conversations

**Prompt Addition:**
```
When the user creates or discusses a task, consider suggesting an implementation
intention in the format: "After [specific anchor], I will [concrete first action]
for [specific duration]." Prioritize tasks that are important but often avoided.
```

### Test Cases

```
TC-1.1: Create Implementation Intention
  Given: User has an active task "Write literature review"
  When: User creates intention with cue "After morning coffee" and action "Open Scrivener and write for 25 minutes"
  Then: Intention is saved with taskId linked
  And: Intention appears in active intentions list
  And: Task shows intention indicator

TC-1.2: Enforce 3-Intention Limit
  Given: User has 3 active intentions
  When: User attempts to create a 4th active intention
  Then: System warns that limit reached
  And: Offers to deactivate an existing intention
  And: Does not allow 4th active intention without deactivation

TC-1.3: Record Intention Trigger - Success
  Given: User has active intention for "After lunch"
  When: User clicks "Completed" on intention card
  Then: successCount increments by 1
  And: lastTriggeredAt updates to current timestamp
  And: Linked task gets focus (optional UX)

TC-1.4: Record Intention Trigger - Miss
  Given: User has active intention
  When: User clicks "Skipped" on intention card
  Then: missCount increments by 1
  And: Self-compassion prompt displays: "That's okay—what got in the way?"
  And: Option to create coping plan for the obstacle

TC-1.5: Weekly Audit Generation
  Given: User has intentions with trigger history
  When: Weekly audit is generated (Sunday or user-triggered)
  Then: Success rates calculated per intention
  And: Intentions with <50% success rate flagged for review
  And: Suggestions generated for low-performing cues

TC-1.6: Coping Plan Creation
  Given: User identifies obstacle "Phone distracts me"
  When: User creates coping intention "If I feel urge to check phone, then I will put it in another room"
  Then: Intention saved with isCopingPlan = true
  And: Displayed separately in "Coping Plans" section

TC-1.7: AI Suggests Implementation Intention
  Given: User asks AI to help with avoided task
  When: AI responds with task breakdown
  Then: AI includes suggested implementation intention
  And: User can accept/modify/reject suggestion
  And: Accepted intention is created automatically
```

### Implementation Notes

- Store intentions in separate JSON file (`intentions.json`) following existing data patterns
- Use same locking mechanism as tasks for concurrent access
- Consider notification/reminder system for time-based cues (future enhancement)
- Mobile-friendly display for quick triggering throughout day

---

## Feature 2: Energy & Recovery Tracking

### Priority: HIGH (Foundational)

**Research Basis:** Energy management is foundational—without adequate capacity, other skills cannot be applied effectively. Microbreaks show HIGH evidence for well-being and MODERATE for performance (Albulescu et al., 2022). Sleep adequacy is HIGH evidence for cognition (Lo et al., 2016). The research explicitly states: "Recovery is capacity-building, not indulgence."

**Key Insight:** Plan at ~60–70% of available capacity (buffer for interruptions, especially with family/health constraints).

### User Stories

```
US-2.1: As an academic with variable energy, I want to log my daily energy level
        so that I can match task difficulty to capacity.

US-2.2: As a user, I want to track sleep hours so that I can see how sleep
        affects my productivity over time.

US-2.3: As a user, I want microbreak reminders during focus blocks so that I
        maintain cognitive capacity throughout the day.

US-2.4: As a user, I want to see my energy patterns over time so that I can
        identify what affects my capacity.

US-2.5: As a user planning my day, I want the schedule to account for my current
        energy level so that I don't overcommit when depleted.

US-2.6: As a user, I want recovery activities (breaks, exercise, rest) treated
        as legitimate schedule blocks so that I don't skip them.
```

### Detailed Specification

#### Data Model Extension

```typescript
// types/data.ts additions

interface DailyEnergy {
  date: string;                  // YYYY-MM-DD
  morningEnergy: number;         // 1-5 scale
  afternoonEnergy?: number;      // Optional mid-day check
  eveningEnergy?: number;        // End of day reflection
  sleepHours?: number;           // Previous night
  sleepQuality?: number;         // 1-5 scale
  exerciseMinutes?: number;      // Any movement
  microbreaksTaken?: number;     // Count for the day
  notes?: string;                // Free-form observations
  updatedAt: string;
}

interface EnergyFile {
  version: number;
  entries: DailyEnergy[];        // Last 90 days retained
}

// Extend ScheduleBlock type
interface ScheduleBlock {
  // ... existing fields
  type: 'deep_work' | 'shallow_work' | 'meeting' | 'break' | 'life' | 'recovery';
  energyRequired?: 'high' | 'medium' | 'low';  // For task blocks
}
```

#### API Endpoints

```
GET    /api/energy                 - Get energy entries (default: last 30 days)
GET    /api/energy/today           - Get or create today's entry
PATCH  /api/energy/today           - Update today's energy data
GET    /api/energy/insights        - Get patterns and correlations
POST   /api/energy/microbreak      - Log a microbreak taken
```

#### UI Components

1. **Morning Energy Check-in** (appears on app open if not yet logged)
   - Simple 1-5 scale with emoji indicators
   - Optional sleep hours input
   - Takes <30 seconds
   - Can be dismissed and logged later

2. **Energy Indicator** (persistent in header or status area)
   - Current energy level icon
   - Click to update or view details
   - Color-coded: green (4-5), yellow (3), red (1-2)

3. **Microbreak Prompt** (during focus blocks)
   - Gentle notification after 45-60 minutes of focus
   - Suggests 2-5 minute break activities
   - "Take break" / "5 more minutes" / "Skip" options
   - Tracks breaks taken

4. **Energy Insights Panel** (in settings or dedicated view)
   - 7-day and 30-day energy trends
   - Sleep vs. energy correlation
   - Best/worst days pattern identification
   - Simple, non-judgmental data presentation

5. **Recovery Blocks in Schedule**
   - Dedicated "recovery" block type with distinct styling
   - Pre-populated suggestions: "Microbreak", "Walk", "Rest"
   - Cannot be easily deleted (requires confirmation)

#### AI Integration

**Prompt Addition:**
```
When creating or adjusting the daily plan, consider the user's energy level.
If energy is low (1-2), suggest:
- Lighter tasks or shorter focus blocks
- Additional recovery time
- Permission to do less without self-criticism

When energy is high (4-5), this is the time for challenging deep work.

Always include at least 2-4 microbreak slots in any full-day schedule.
Recovery blocks are as important as work blocks.
```

### Test Cases

```
TC-2.1: Morning Energy Check-in
  Given: User opens app in morning without today's energy logged
  When: App loads
  Then: Energy check-in prompt appears (non-blocking)
  And: User can rate energy 1-5
  And: Entry created with morningEnergy and timestamp

TC-2.2: Update Energy Mid-day
  Given: User has morning energy logged
  When: User clicks energy indicator and selects new level
  Then: afternoonEnergy field updates
  And: UI reflects new energy state

TC-2.3: Sleep Hours Tracking
  Given: User is doing morning check-in
  When: User enters "6.5" for sleep hours
  Then: sleepHours saved to today's entry
  And: If <7 hours, gentle note about recovery importance

TC-2.4: Microbreak Reminder
  Given: User has been in focus mode for 50 minutes
  When: Timer triggers microbreak check
  Then: Non-intrusive notification appears
  And: Suggests brief activity (stretch, walk, breathe)
  And: User response logged (taken/skipped/snoozed)

TC-2.5: Energy-Aware Scheduling
  Given: User's morning energy is 2 (low)
  When: AI creates daily plan
  Then: Deep work blocks are shorter or fewer
  And: Recovery blocks are more prominent
  And: AI acknowledges low energy without judgment

TC-2.6: Energy Insights Calculation
  Given: User has 14+ days of energy data
  When: User views insights panel
  Then: Average energy by day of week shown
  And: Sleep-energy correlation displayed
  And: Best days pattern identified (if any)

TC-2.7: Recovery Block Protection
  Given: Schedule includes recovery block at 2:30 PM
  When: User attempts to delete or replace it
  Then: Confirmation dialog appears
  And: Reminds user that recovery enables productivity
  And: Requires explicit confirmation to remove
```

### Implementation Notes

- Keep energy logging extremely lightweight (<30 seconds)
- Default to simple scales (1-5) rather than complex metrics
- Show trends, not judgments ("Your energy was lower this week" not "You failed")
- Consider optional integration with health apps (future)
- Microbreak suggestions should be concrete: "Stand up and stretch for 2 minutes"

---

## Feature 3: Weekly Review Ritual

### Priority: HIGH (Critical Feedback Loop)

**Research Basis:** Time management correlates with performance (r = 0.22), academic achievement (r = 0.35), and well-being (r = 0.39) (Aeon, Faber, & Panaccio, 2021). Progress monitoring increases goal attainment with d = 0.40, especially when outcomes are recorded (Harkin et al., 2016). The weekly review creates the essential feedback loop that enables systematic improvement.

**Key Insight:** "If You Only Do 3 Things" from the research includes a weekly review ritual as critical infrastructure.

### User Stories

```
US-3.1: As an academic, I want a structured weekly review process so that I
        can reflect on what worked and adjust my approach.

US-3.2: As a user, I want to identify my "Big 3" outcomes for the coming week
        so that I maintain focus on high-value work.

US-3.3: As a user, I want to see how my completed work aligned with my values
        so that I stay connected to meaningful work.

US-3.4: As a user, I want the review to take 20-30 minutes maximum so that it
        remains sustainable.

US-3.5: As a user, I want to capture learnings and insights during review so
        that I build knowledge over time.

US-3.6: As a user, I want to be prompted for weekly review at a consistent time
        so that it becomes a reliable ritual.
```

### Detailed Specification

#### Data Model Extension

```typescript
// types/data.ts additions

interface WeeklyReview {
  id: string;
  weekStartDate: string;         // Monday of the week (YYYY-MM-DD)
  weekEndDate: string;           // Sunday of the week

  // Reflection
  wentWell: string[];            // What worked this week
  challenges: string[];          // What was difficult
  learnings: string[];           // Insights to remember

  // Metrics snapshot
  tasksCompleted: number;
  focusBlocksCompleted: number;
  averageEnergy: number;
  valueAlignmentRating: number;  // 1-5: How aligned was work with values?

  // Planning
  bigThree: {                    // Next week's priorities
    outcome: string;
    taskIds: string[];           // Linked tasks
    valueAlignment: string;      // Which value this serves
  }[];

  // Meta
  durationMinutes: number;       // How long review took
  completedAt: string;
  notes?: string;
}

interface ReviewsFile {
  version: number;
  reviews: WeeklyReview[];
  preferredReviewDay: 'friday' | 'saturday' | 'sunday';
  preferredReviewTime: string;   // HH:MM
}
```

#### API Endpoints

```
GET    /api/reviews                - List past reviews
GET    /api/reviews/current        - Get this week's review (create if needed)
PATCH  /api/reviews/current        - Update current review
GET    /api/reviews/prepare        - Get data for review (completions, metrics)
POST   /api/reviews/complete       - Finalize and save review
```

#### UI Components

1. **Weekly Review Wizard** (guided multi-step flow)

   **Step 1: Celebrate Progress** (2-3 min)
   - Auto-populated: Tasks completed this week
   - Prompt: "What went well? What are you proud of?"
   - Simple wins list builder

   **Step 2: Acknowledge Challenges** (2-3 min)
   - Prompt: "What was difficult? What got in the way?"
   - Non-judgmental framing
   - Option to create coping plans for recurring obstacles

   **Step 3: Capture Learnings** (2-3 min)
   - Prompt: "What did you learn? What would you do differently?"
   - Auto-save to learnings store for AI context

   **Step 4: Values Check** (2-3 min)
   - Display user's core values
   - "How aligned was this week's work with your values?" (1-5)
   - Highlight any values that were neglected

   **Step 5: Plan Big Three** (5-10 min)
   - "What 3 outcomes would make next week successful?"
   - Link each to existing tasks or create new ones
   - Connect each to a core value
   - AI can suggest based on pending tasks and deadlines

   **Step 6: Schedule Confirmation** (3-5 min)
   - Preview next week's schedule
   - Ensure Big Three have protected time blocks
   - Capacity check: Is this realistic at 60-70%?

2. **Review Reminder**
   - Notification at preferred day/time
   - "Time for your weekly review (20 min)"
   - Quick access to review wizard

3. **Review History**
   - Past reviews accessible for reference
   - Trend visualization (completion rates, energy, values alignment)
   - Searchable learnings archive

#### AI Integration

**Prompt Addition:**
```
During weekly review conversations:
- Help the user celebrate wins, even small ones
- Frame challenges as data, not failures
- Suggest Big Three outcomes based on pending tasks and stated values
- Ensure each Big Three connects to a value
- Check that planned work fits realistic capacity (60-70% of time)
- Offer to create implementation intentions for Big Three items

When the user hasn't done a weekly review in 7+ days, gently prompt them.
```

### Test Cases

```
TC-3.1: Initiate Weekly Review
  Given: It's Sunday and user hasn't completed this week's review
  When: User clicks "Start Weekly Review" or opens review wizard
  Then: Review wizard opens at Step 1
  And: Completed tasks this week pre-populated
  And: Timer starts tracking review duration

TC-3.2: Capture What Went Well
  Given: User is in Step 1 of review
  When: User adds "Finished draft of chapter 3" to wins
  Then: Entry saved to wentWell array
  And: Positive reinforcement shown briefly

TC-3.3: Non-judgmental Challenge Capture
  Given: User is in Step 2 of review
  When: User adds "Kept getting distracted by email"
  Then: Entry saved to challenges array
  And: Prompt offers: "Want to create a coping plan for this?"
  And: No shame-inducing language used

TC-3.4: Values Alignment Rating
  Given: User's values are [scholarship, family, health]
  When: User reaches Step 4
  Then: Values displayed with this week's relevant completions
  And: User rates alignment 1-5
  And: If any value has no associated tasks, it's highlighted

TC-3.5: Big Three Planning
  Given: User is in Step 5
  When: User enters "Submit grant proposal" as Big Three item
  Then: Can link to existing task or create new one
  And: Must select which value it serves
  And: Item saved to bigThree array

TC-3.6: Capacity Check
  Given: User has set Big Three with many associated tasks
  When: Review calculates time required
  Then: If >70% of available time, warning shown
  And: Suggests reducing scope or extending timeline
  And: User must acknowledge before proceeding

TC-3.7: Review Completion
  Given: User completes all review steps
  When: User clicks "Complete Review"
  Then: Review saved with completedAt timestamp
  And: Duration recorded
  And: Learnings synced to learnings store
  And: Big Three tasks marked as priorities

TC-3.8: Review Reminder
  Given: User's preferred review time is Sunday 5PM
  When: Sunday 5PM arrives and no review completed
  Then: Reminder notification appears
  And: One-click access to review wizard
  And: Can snooze for 1 hour or tomorrow
```

### Implementation Notes

- Wizard should be completable in 20-30 minutes (track and display time)
- Progress auto-saves; user can pause and resume
- Keep questions simple and concrete
- Avoid overwhelming with metrics—focus on narrative reflection
- Reviews should be private by default (not shared with AI unless user opts in)

---

## Feature 4: Self-Compassion & Streak Recovery

### Priority: HIGH (Prevents System Collapse)

**Research Basis:** Self-compassion correlates with well-being (r ≈ 0.45) and negatively with psychopathology (MacBeth & Gumley, 2012). Critically, self-compassion (vs. self-esteem boost) led to greater motivation to improve after failure (Breines & Chen, 2012). The research emphasizes: "Self-criticism triggers threat-defense responses... creating shame spirals: setback → harsh self-talk → more avoidance → more setbacks."

**Key Design Principle:** "Never miss twice" over streak counting. The goal is rapid recovery, not perfect consistency.

### User Stories

```
US-4.1: As a user who missed planned tasks, I want compassionate messaging so
        that I don't spiral into avoidance.

US-4.2: As a user, I want a "never miss twice" system instead of streaks so
        that one bad day doesn't feel like total failure.

US-4.3: As a user returning after time away, I want a gentle re-engagement flow
        so that I can restart without shame.

US-4.4: As a user who just missed a commitment, I want to quickly identify what
        got in the way so that I can create a coping plan.

US-4.5: As a user, I want the app to reframe setbacks as data rather than
        failure so that I maintain a learning mindset.

US-4.6: As a user, I want self-compassion prompts paired with concrete next
        actions so that kindness leads to engagement, not disengagement.
```

### Detailed Specification

#### Data Model Extension

```typescript
// types/data.ts additions

interface RecoveryEvent {
  id: string;
  date: string;
  type: 'missed_task' | 'missed_intention' | 'missed_day' | 'return_after_gap';
  context?: string;              // What got in the way (optional)
  copingPlanCreated?: string;    // ID of resulting coping plan
  nextActionTaken?: string;      // What user committed to
  timestamp: string;
}

interface CompassionSettings {
  enableCompassionPrompts: boolean;  // Default true
  missedDayThreshold: number;        // Days before "return" flow (default 3)
  preferredCompassionStyle: 'gentle' | 'coach' | 'minimal';
}

// Extend existing settings
interface Settings {
  // ... existing fields
  compassion: CompassionSettings;
}
```

#### Messaging Framework

**Core Messages (rotate/vary to prevent habituation):**

*After missed task:*
- "That's okay. What got in the way?"
- "Setbacks are data, not verdicts. What happened?"
- "This is part of the process. What's one small step you can take now?"

*After missed day:*
- "Yesterday didn't go as planned. Today is a fresh start."
- "One day doesn't define your progress. What's your one priority today?"
- "You're human. What's the smallest thing you can do right now?"

*Return after gap (3+ days):*
- "Welcome back. No guilt, just a fresh start."
- "Life happened. Let's ease back in with something small."
- "You're here now—that's what matters. What feels manageable today?"

**Always end with action prompt:**
- "What's one small thing you can do in the next 10 minutes?"
- "What's the easiest task you could start right now?"

#### UI Components

1. **Compassion Prompt** (modal or gentle banner)
   - Appears when missed commitment detected
   - Kind message + obstacle inquiry
   - Quick coping plan creator option
   - "Next small action" commitment
   - Never judgmental or guilt-inducing

2. **Return Flow** (for gaps of 3+ days)
   - Acknowledges time away without drama
   - Shows simplified task list (just today's essentials)
   - Suggests smallest possible re-entry action
   - Option for quick "status update" to AI
   - No metrics or "you missed X days" counters

3. **"Never Miss Twice" Indicator**
   - Instead of streaks: Simple status per habit/intention
   - Green: Completed recently
   - Yellow: Missed once (recovery window)
   - Gentle prompt when in yellow state
   - No red/failure state—just compassionate re-engagement

4. **Reframe Helper**
   - When user expresses frustration in chat
   - AI offers three-component self-compassion:
     1. "This is hard" (acknowledge difficulty)
     2. "Others struggle with this too" (common humanity)
     3. "What would you tell a friend?" (kind response)
   - Always followed by action step

#### AI Integration

**Prompt Addition:**
```
When the user expresses frustration, self-criticism, or reports missed commitments:

1. DO NOT lecture, moralize, or add "should" statements
2. Acknowledge the difficulty briefly and kindly
3. Normalize the experience ("This is common" / "Many people struggle with this")
4. Ask what got in the way (genuine curiosity, not interrogation)
5. Offer to create a coping plan if a pattern emerges
6. ALWAYS end with a small, achievable next action
7. Use "never miss twice" framing—one miss is data, two misses is a pattern to address

Example response to "I didn't do anything on my list today":
"That happens. What got in the way? [wait for response] That makes sense.
Let's not let it become two days. What's the smallest thing you could do
in the next 10 minutes to get back on track?"
```

### Test Cases

```
TC-4.1: Missed Task Compassion Prompt
  Given: User had task scheduled for yesterday that wasn't completed
  When: User opens app today
  Then: Gentle compassion prompt appears
  And: Asks "What got in the way?" (optional response)
  And: Offers coping plan creation
  And: Suggests small next action

TC-4.2: Never Miss Twice - First Miss
  Given: User missed their "morning writing" intention yesterday
  When: App displays intention status
  Then: Shows "yellow" recovery state (not failure)
  And: Message: "Let's get back to it today"
  And: No streak counter or "days missed"

TC-4.3: Never Miss Twice - Recovery Success
  Given: User is in "yellow" recovery state for an intention
  When: User completes the intention today
  Then: Status returns to green
  And: Brief celebration: "Back on track!"
  And: No reference to previous miss

TC-4.4: Return After Gap Flow
  Given: User hasn't opened app in 5 days
  When: User opens app
  Then: "Welcome back" message appears
  And: Simplified view shows only essential tasks
  And: Suggests smallest possible action
  And: No guilt-inducing metrics shown

TC-4.5: Obstacle Capture and Coping Plan
  Given: User reports obstacle "Kids needed attention"
  When: User submits obstacle in compassion prompt
  Then: Context saved to recovery event
  And: Offers: "Want to plan for next time this happens?"
  And: Can create coping intention directly

TC-4.6: AI Self-Compassion Response
  Given: User messages "I'm so behind on everything"
  When: AI responds
  Then: Response acknowledges difficulty without judgment
  And: Normalizes experience
  And: Does NOT lecture or add "shoulds"
  And: Ends with concrete small action suggestion

TC-4.7: Compassionate Accountability Balance
  Given: User has missed same task 3 days in a row
  When: Compassion prompt appears
  Then: Still kind in tone
  And: Notes pattern: "This has been tough for a few days"
  And: Suggests reevaluating: "Is this task right-sized? Right-timed?"
  And: Offers to break down or reschedule
```

### Implementation Notes

- Language should feel human, not robotic ("That's okay" vs "Acknowledged")
- Vary messages to prevent habituation
- Never show cumulative failure metrics ("You've missed 12 tasks this month")
- Recovery is always one small action away
- Optional: Let users choose compassion style (gentle, coach-like, minimal)

---

## Feature 5: Two-Minute Entry & Graded Exposure

### Priority: MEDIUM-HIGH (Behavioral Activation)

**Research Basis:** Behavioral activation for depression shows effects comparable to full CBT (Cuijpers et al., 2007). CBT approaches including behavioral components meaningfully reduce procrastination (van Eerde & Klingsieck, 2018). The research states: "Procrastination is often short-term mood repair—avoiding discomfort creates immediate relief but long-term costs."

**Key Technique:** "Two-minute entry rule: Do 2 minutes of the task, then permission to stop. Often you continue."

### User Stories

```
US-5.1: As a user facing an avoided task, I want a "just 2 minutes" option so
        that I can start without committing to the full task.

US-5.2: As a user with a large project, I want to break it into a task ladder
        so that I can approach it gradually.

US-5.3: As a user, I want to define "minimum viable output" for tasks so that
        I know what "done enough" looks like.

US-5.4: As a user who completed my 2 minutes, I want the option to continue or
        stop guilt-free so that the commitment is honored.

US-5.5: As a user, I want to see how my dread compared to reality after starting
        so that I learn that starting is the hardest part.

US-5.6: As a user, I want avoided tasks identified automatically so that I can
        address procrastination patterns proactively.
```

### Detailed Specification

#### Data Model Extension

```typescript
// types/data.ts additions

interface TaskLadder {
  taskId: string;                // Parent task
  steps: {
    id: string;
    description: string;
    order: number;
    isCompleted: boolean;
    completedAt?: string;
    dreadBefore?: number;        // 1-10 scale
    dreadAfter?: number;         // 1-10 after completion
  }[];
  createdAt: string;
}

interface TwoMinuteSession {
  id: string;
  taskId: string;
  startedAt: string;
  endedAt?: string;
  continued: boolean;            // Did user continue past 2 min?
  totalMinutes?: number;
  dreadBefore: number;           // 1-10
  dreadAfter?: number;           // 1-10
  notes?: string;
}

// Extend Task type
interface Task {
  // ... existing fields
  minimumViableOutput?: string;  // What counts as "done enough"
  avoidanceScore?: number;       // Calculated from skip patterns
  ladder?: TaskLadder;
}
```

#### API Endpoints

```
POST   /api/tasks/[id]/two-minute/start   - Start 2-min session
POST   /api/tasks/[id]/two-minute/end     - End session (continued/stopped)
POST   /api/tasks/[id]/ladder             - Create task ladder
PATCH  /api/tasks/[id]/ladder             - Update ladder progress
GET    /api/tasks/avoided                 - Get tasks with high avoidance
```

#### UI Components

1. **"Just 2 Minutes" Button**
   - Appears on task cards, especially avoided tasks
   - Prominent, low-commitment styling ("Give it 2 min")
   - Opens focused timer view

2. **Two-Minute Timer View**
   - Clean countdown timer (2:00)
   - Task title and first action visible
   - Optional: Dread rating before starting (1-10)
   - At 2:00: "Great! Continue or stop—both are wins"
   - If continuing: Timer counts up, stop anytime
   - After stopping: Quick dread-after rating

3. **Task Ladder Builder**
   - For large/complex tasks
   - AI suggests breakdown: "What's the smallest first step?"
   - 3-5 steps from easiest to hardest
   - Visual progress through ladder
   - Each step can have its own 2-minute entry

4. **Minimum Viable Output Field**
   - On task detail view
   - Prompt: "What's the minimum that counts as progress?"
   - Examples: "One paragraph", "15 minutes of reading", "Outline only"
   - Displayed during work to prevent scope creep

5. **Avoidance Insights**
   - Flags tasks that have been postponed 3+ times
   - Suggests: "This task seems hard to start. Try 2 minutes?"
   - Offers ladder creation for persistent avoidance

6. **Dread vs Reality Reflection**
   - After 2-minute sessions, shows comparison
   - "You expected 7/10 dread, actual was 4/10"
   - Over time: "Starting is usually easier than you expect"

#### AI Integration

**Prompt Addition:**
```
When the user mentions avoiding a task or feeling overwhelmed:
1. Suggest the two-minute entry: "What if you just did 2 minutes? You can stop after."
2. Help break large tasks into ladders (3-5 steps, smallest first)
3. Ask about minimum viable output: "What would count as meaningful progress, even if small?"
4. After completion, reinforce: "You did it! How did the reality compare to the dread?"

For tasks the user repeatedly postpones:
- Proactively suggest addressing them with 2-minute approach
- Help identify what makes the task aversive
- Create coping plans for the specific obstacles
```

### Test Cases

```
TC-5.1: Start Two-Minute Session
  Given: User views an avoided task
  When: User clicks "Just 2 minutes"
  Then: Dread rating prompt appears (optional, can skip)
  And: Timer starts at 2:00 countdown
  And: Task details visible during session

TC-5.2: Complete Two Minutes - Stop
  Given: User is in two-minute session, timer at 0:00
  When: Prompt appears "Continue or stop?"
  And: User clicks "Stop (that's a win!)"
  Then: Session saved with continued=false
  And: Dread-after rating prompt (optional)
  And: Positive message: "You started! That's the hardest part."

TC-5.3: Complete Two Minutes - Continue
  Given: Timer reaches 0:00
  When: User clicks "Keep going"
  Then: Timer switches to count-up mode
  And: User can stop anytime
  And: Total time tracked in session

TC-5.4: Dread Comparison Display
  Given: User rated dread 8/10 before, 4/10 after
  When: Session completes
  Then: Shows comparison: "Expected: 8 → Actual: 4"
  And: Reinforcement: "It's often easier than we expect"

TC-5.5: Create Task Ladder
  Given: User has large task "Write dissertation chapter"
  When: User initiates ladder creation
  Then: AI suggests first step: "What's the tiniest starting point?"
  And: User builds 3-5 step ladder
  And: Each step saved with order and completion status

TC-5.6: Ladder Progress
  Given: Task has 4-step ladder, step 1 completed
  When: User views task
  Then: Ladder progress shown (1/4)
  And: Current step highlighted
  And: "Just 2 minutes" available for current step

TC-5.7: Avoidance Detection
  Given: Task has been postponed 4 times
  When: Task appears in manifest
  Then: Subtle avoidance indicator shown
  And: Tooltip: "This one's been hard to start. Try 2 minutes?"
  And: Two-minute button more prominent

TC-5.8: Minimum Viable Output
  Given: User creates task "Review paper"
  When: User adds minimum viable output "Read abstract and intro"
  Then: MVO saved with task
  And: Displayed during focus/timer views
  And: Completion prompt references MVO
```

### Implementation Notes

- Two-minute timer should be distraction-free (minimal UI)
- Never shame for stopping at 2 minutes—that's a success
- Ladders should be simple (3-5 steps max, usually 2-3 is enough)
- Track dread ratings over time to show patterns
- Avoidance detection should be helpful, not judgmental

---

## Feature 6: Progress Dashboard (Minimal Metrics)

### Priority: MEDIUM (Feedback Loop)

**Research Basis:** Progress monitoring increases goal attainment with d = 0.40 (Harkin et al., 2016). However, the research strongly warns: "Excessive tracking can undermine motivation" and recommends "3–5 core metrics" maximum. The dashboard should enable navigation, not judgment.

**Key Principle:** "Treat metrics as navigation, not judgment."

### User Stories

```
US-6.1: As a user, I want to see 3-4 key metrics at a glance so that I can
        assess my trajectory without overwhelm.

US-6.2: As a user, I want weekly trends rather than daily scores so that I
        focus on patterns, not single days.

US-6.3: As a user, I want progress data presented without judgment so that
        metrics feel like navigation tools, not report cards.

US-6.4: As a user, I want to customize which metrics I see so that I track
        what matters for my situation.

US-6.5: As a user, I want insights that suggest adjustments so that data leads
        to action, not just observation.

US-6.6: As a user, I want the option to hide the dashboard entirely so that I
        can opt out if tracking doesn't serve me.
```

### Detailed Specification

#### Core Metrics (Default Set)

Based on research recommendations for minimal effective tracking:

1. **Focus Blocks Completed** (primary output metric)
   - Count of completed focus/deep work blocks per week
   - Compare to planned blocks (completion rate)

2. **Energy Average** (capacity metric)
   - Average daily energy rating for the week
   - Trend compared to previous weeks

3. **Meaningful Progress Rating** (subjective outcome)
   - Weekly self-rating: "How meaningful was your progress?" (1-10)
   - Captured during weekly review

4. **Values Alignment** (quality metric)
   - From weekly review: alignment rating
   - Which values got attention vs. neglected

**Optional Metrics** (user can enable):
- Sleep hours average
- Tasks completed count
- Implementation intention success rate
- Two-minute sessions initiated

#### Data Model Extension

```typescript
// types/data.ts additions

interface DashboardConfig {
  enabled: boolean;              // Can disable entirely
  metrics: {
    focusBlocks: boolean;
    energyAverage: boolean;
    meaningfulProgress: boolean;
    valuesAlignment: boolean;
    // Optional metrics
    sleepHours: boolean;
    tasksCompleted: boolean;
    intentionSuccess: boolean;
    twoMinuteSessions: boolean;
  };
  comparisonPeriod: 'week' | 'month';
}

interface WeeklyMetrics {
  weekStartDate: string;
  focusBlocksPlanned: number;
  focusBlocksCompleted: number;
  averageEnergy: number;
  meaningfulProgressRating?: number;  // From weekly review
  valuesAlignmentRating?: number;     // From weekly review
  sleepHoursAverage?: number;
  tasksCompleted: number;
  intentionSuccessRate?: number;
  twoMinuteSessionsStarted: number;
}
```

#### API Endpoints

```
GET    /api/dashboard              - Get current dashboard data
GET    /api/dashboard/metrics      - Get historical metrics
PATCH  /api/dashboard/config       - Update dashboard configuration
GET    /api/dashboard/insights     - Get actionable insights
```

#### UI Components

1. **Dashboard Panel** (collapsible, optional view)
   - Clean card layout with 3-4 metrics
   - This week vs. last week comparison
   - Simple trend indicators (↑ ↓ →)
   - No red/failure colors—use neutral palette

2. **Metric Cards**
   - Large, clear number
   - Brief label
   - Subtle trend indicator
   - Click for detail/history
   - No gamification (no badges, levels, or achievements)

3. **Weekly Trend View**
   - 4-8 week sparkline per metric
   - Optional detailed view with context
   - Annotations for significant events (travel, illness, etc.)

4. **Insights Panel**
   - 1-2 actionable observations per week
   - Examples:
     - "Energy is higher on days with morning exercise"
     - "Focus blocks drop on meeting-heavy days"
     - "Consider protecting Wednesday mornings"
   - Always framed as suggestions, not prescriptions

5. **Dashboard Settings**
   - Toggle entire dashboard on/off
   - Select which metrics to display (3-4 recommended)
   - Warning if >5 metrics selected

#### Metric Presentation Guidelines

**DO:**
- Show trends, not absolute judgments
- Use neutral language ("Lower this week" not "You failed")
- Compare to personal baseline, not external standards
- Offer one adjustment suggestion per insight
- Allow hiding/minimizing

**DON'T:**
- Use red for "bad" metrics
- Show streaks or gamification elements
- Display cumulative failure counts
- Compare to other users
- Make dashboard mandatory

#### AI Integration

**Prompt Addition:**
```
When discussing progress or performance:
- Reference dashboard data if relevant and helpful
- Frame observations neutrally: "Focus blocks were lower this week" not "You didn't do enough"
- Connect patterns to context: "This coincided with your conference travel"
- Suggest ONE small adjustment based on data
- Never lecture about metrics or create pressure around numbers
- If user seems stressed by tracking, offer to simplify or hide dashboard
```

### Test Cases

```
TC-6.1: Dashboard Default Display
  Given: User has dashboard enabled with default metrics
  When: User views dashboard
  Then: Shows 4 metric cards (focus, energy, progress, values)
  And: Each shows current week value and trend
  And: No red/failure indicators

TC-6.2: Metric Customization
  Given: User opens dashboard settings
  When: User disables "Values Alignment" and enables "Sleep Hours"
  Then: Dashboard updates to show selected metrics
  And: Configuration persists across sessions

TC-6.3: Disable Dashboard Entirely
  Given: User finds tracking stressful
  When: User toggles "Enable Dashboard" off
  Then: Dashboard panel hidden
  And: No metric tracking prompts appear
  And: Weekly review still works (metrics optional)

TC-6.4: Weekly Comparison
  Given: This week: 8 focus blocks, Last week: 12 focus blocks
  When: Dashboard displays focus blocks metric
  Then: Shows "8 focus blocks" with "↓ from 12 last week"
  And: Neutral color (no red)
  And: No judgment language

TC-6.5: Trend Visualization
  Given: User has 6 weeks of focus block data
  When: User clicks focus blocks metric for detail
  Then: Shows 6-week sparkline
  And: Identifies patterns: "Higher early in week"
  And: No prescriptive language

TC-6.6: Actionable Insight Generation
  Given: User's energy is consistently higher on exercise days
  When: Insights are generated
  Then: Shows: "Energy averages 4.2 on exercise days vs 2.8 on rest days"
  And: Suggests: "Consider protecting time for movement"
  And: Phrased as observation, not command

TC-6.7: Metric Limit Warning
  Given: User has 4 metrics enabled
  When: User tries to enable 5th and 6th metrics
  Then: Shows warning: "Research suggests 3-5 metrics. More may reduce effectiveness."
  And: Allows override if user chooses
  And: No blocking

TC-6.8: No Data State
  Given: New user with no historical data
  When: Dashboard is viewed
  Then: Shows: "Dashboard will populate as you use ProfFlow"
  And: Suggests: "Start by logging your energy and planning a focus block"
  And: No empty/zero displays
```

### Implementation Notes

- Dashboard should be secondary UI, not prominent
- Default to collapsed/minimal view
- Aggregate data weekly, not daily (reduces noise)
- Store only 90 days of detailed data; aggregate older data
- Insights should be generated weekly, not in real-time
- Consider making dashboard opt-in rather than default

---

## Implementation Priority Matrix

| Feature | Impact | Evidence | Effort | Priority |
|---------|--------|----------|--------|----------|
| 1. Implementation Intentions | Very High | HIGH (d=0.65-0.99) | Medium | **P0** |
| 2. Energy & Recovery | High | HIGH/MODERATE | Medium | **P0** |
| 3. Weekly Review Ritual | High | HIGH (d=0.40) | Medium | **P1** |
| 4. Self-Compassion & Recovery | High | MODERATE | Low | **P1** |
| 5. Two-Minute Entry | Medium-High | MODERATE-HIGH | Low | **P2** |
| 6. Progress Dashboard | Medium | HIGH (with caveats) | Medium | **P2** |

### Recommended Implementation Order

**Phase 1 (Foundation):**
1. Self-Compassion messaging (low effort, high impact on retention)
2. Energy tracking basics (morning check-in, simple scale)

**Phase 2 (Core Systems):**
3. Implementation Intentions (highest evidence-based feature)
4. Weekly Review wizard

**Phase 3 (Engagement):**
5. Two-Minute Entry system
6. Progress Dashboard (with heavy emphasis on minimal metrics)

---

## Appendix A: Research Citations

Key sources referenced in feature design:

1. Gollwitzer, P.M., & Sheeran, P. (2006). Implementation intentions and goal achievement: A meta-analysis. *Advances in Experimental Social Psychology*, 38, 69-119.

2. Albulescu, P., et al. (2022). "Give me a break!" A systematic review and meta-analysis on the efficacy of micro-breaks. *PLoS ONE*, 17(8).

3. Aeon, B., Faber, A., & Panaccio, A. (2021). Does time management work? A meta-analysis. *PLoS ONE*, 16(1).

4. Harkin, B., et al. (2016). Does monitoring goal progress promote goal attainment? A meta-analysis. *Psychological Bulletin*, 142(2), 198-229.

5. Ferrari, M., et al. (2019). Self-compassion interventions and psychosocial outcomes. *Mindfulness*, 10, 1455-1473.

6. van Eerde, W., & Klingsieck, K.B. (2018). Overcoming procrastination? A meta-analysis of intervention studies. *Educational Research Review*, 25, 73-85.

7. Breines, J.G., & Chen, S. (2012). Self-compassion increases self-improvement motivation. *Personality and Social Psychology Bulletin*, 38(9), 1133-1143.

---

## Appendix B: Design Principles Summary

Based on research, all features should follow these principles:

1. **Start small** - Graduated exposure, tiny habits, 2-minute entries
2. **Limit metrics** - 3-5 maximum; more causes disengagement
3. **Never miss twice** - Recovery over perfection
4. **Kindness + action** - Self-compassion paired with behavioral commitment
5. **Data as navigation** - Metrics inform, not judge
6. **Recovery is productive** - Breaks and rest are capacity-building
7. **Autonomy matters** - Choices within structure, opt-out available
8. **Weekly rhythm** - Feedback loops need regular review

---

*Document Version: 1.0*
*Created: Based on Claude Productivity Research Report analysis*
*For: ProfFlow Development Team*
