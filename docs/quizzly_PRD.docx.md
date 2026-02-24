

PRODUCT REQUIREMENTS DOCUMENT

**AI-Era Engineering**

**Skills Trainer**

*Training bootcamp graduates to think like senior engineers by building critical evaluation, architectural thinking, and AI collaboration skills.*

Version 1.0  |  MVP Definition

February 2026

| IMPORTANT: UNVALIDATED HYPOTHESIS This PRD is built on a hypothesis supported by personal experience and 3 anecdotal peer conversations. No structured user research was conducted. The core assumption that bootcamp graduates need and will use this product has not been validated with target users. The riskiest assumptions must be tested post-launch. |
| :---- |

# **1\. Problem Statement**

*Bootcamp graduates entering the job market lack the ability to evaluate code quality, identify suboptimal approaches, and think architecturally — skills that modern technical interviews increasingly demand as AI tools handle code generation. Currently, they rely on platforms like LeetCode (which trains code writing, not code evaluation), prompting ChatGPT ad-hoc (which requires effort to set up each time and provides no structure or progression), or their bootcamp’s built-in quizzes (which are outdated and focused on recall rather than critical analysis). As a result, graduates feel unprepared to apply for jobs and fail technical interviews that test their ability to review, critique, and improve solutions rather than write them from scratch.*

*This problem statement is based on personal experience and anecdotal evidence from 3 bootcamp peers. It has not been validated through structured user research. Quantification of the pain (e.g., interview failure rates, time spent on inadequate prep) is not available.*

# **2\. Target User**

## **Primary Persona: The Bootcamp Graduate**

**Who:** Recent graduates of fullstack development bootcamps (3–6 month intensive programs) who are transitioning into junior software engineering roles.

**Age Range:** 22–35 years old (career changers and recent university graduates).

**Technical Level:** Can write functional code but lacks depth in algorithms, system design, architectural thinking, and the ability to critically evaluate code quality.

**Behavioral Profile**

* Completed an intensive bootcamp focused on writing code (syntax, frameworks, building projects)

* Actively job searching or about to start applying for junior engineering positions

* Has experienced or fears failing technical interviews that go beyond basic coding

* Uses AI tools (ChatGPT, Cursor, Claude) for coding but lacks skills to evaluate and improve AI-generated output

* Willing to invest time in interview prep (uses or has considered LeetCode, AlgoExpert, etc.)

**Pain Points**

* Bootcamp curriculum was too fast and focused on code-writing mechanics, not problem-solving or architecture

* Existing interview prep platforms (LeetCode) train code production, not code evaluation

* No structured way to practice the skills modern interviews actually test: reviewing AI output, identifying bugs, choosing optimal approaches, designing systems

* Using ChatGPT for ad-hoc practice requires significant prompting effort and provides no progression or tracking

**Secondary Persona (Future Expansion)**

Computer Science university students preparing for technical interviews share the same core pain point: they can write code but lack practice in evaluating, critiquing, and improving code and architecture. This segment can be served by the same product without modification.

# **3\. User Research Summary**

| RESEARCH GAP Structured user research was not conducted. The findings below are based on the product creator’s personal experience and informal conversations with 3 bootcamp cohort members. |
| :---- |

**Evidence Collected**

**Source:** Personal experience completing a fullstack development bootcamp and preparing for technical interviews.

**Supporting Data:** Informal conversations with 3 cohort members.

**Key Quotes from Peers**

*“The course was too fast.”*

*“I don’t think the money was worthy.”*

*“I am not ready for technical interviews.”*

*“I don’t feel ready to apply to jobs.”*

*“The focus was on writing code instead of understanding and finding better approaches like judging AI code generation and seeing that there are better approaches with better time complexity or space complexity.”*

*“They didn’t focus on algorithms.”*

**Observed Patterns**

* Bootcamps teach coding mechanics but not critical evaluation or architectural thinking

* Graduates feel underprepared specifically for system design and architecture interview questions

* The role of AI in engineering is changing what employers expect: less code-writing, more code-evaluation and AI collaboration

* Existing tools like LeetCode required additional paid subscriptions and still didn’t address the evaluation skills gap

**Validation Recommended Post-Launch**

Conduct structured interviews with 10–15 bootcamp graduates using the interview guide developed during product definition. Focus on validating: (1) whether interview failure is tied to evaluation/architecture skills specifically, (2) whether users engage with the product repeatedly, and (3) willingness to pay.

# **4\. Competitive Landscape**

| Competitor | What They Do | Strength | Gap |
| :---- | :---- | :---- | :---- |
| **LeetCode** | Coding challenges for interview prep | Massive problem library, industry standard | Trains code writing, not code evaluation or architectural thinking |
| **AlgoExpert / NeetCode** | Curated algorithm problems with video explanations | High-quality explanations, structured curriculum | Still focused on producing solutions, not evaluating them |
| **ByteByteGo** | System design interview content | Excellent visual explanations of architecture | Educational content, not interactive practice with personalized feedback |
| **ChatGPT / Claude (ad-hoc)** | Users prompt AI to generate practice questions | Flexible, free, immediate | Requires prompting effort each time, no structure, no progression tracking |
| **Pramp / Interviewing.io** | Mock interviews with peers or professionals | Realistic interview simulation | Scheduling friction, human-dependent, no AI-era focus |
| **Bootcamp quizzes** | Built-in assessments within bootcamp curriculum | Aligned with course content | Outdated, recall-focused, not aligned with modern interview expectations |

**Competitive Positioning**

No existing product specifically trains the skill of evaluating, critiquing, and improving code and architecture — the exact skill modern technical interviews increasingly test as AI handles code generation. This product occupies the gap between “write code from scratch” (LeetCode) and “learn system design concepts” (ByteByteGo) by providing interactive, AI-powered critical evaluation exercises tailored to the user’s study materials and goals.

# **5\. Solution Overview**

The AI-Era Engineering Skills Trainer is a web application that generates critical evaluation exercises — find the bug, evaluate AI-generated code, identify better approaches, design system improvements — tailored to the user’s uploaded study materials and goals. Unlike traditional interview prep platforms that test code production, this product trains the reviewer/architect mindset that modern employers demand.

**Core Value Proposition**

*Train bootcamp graduates to think like senior engineers by generating critical evaluation exercises — find the bug, improve the architecture, challenge the AI — tailored to their study materials.*

**Key Differentiators**

* Exercises test code evaluation and architectural thinking, not code writing

* Questions are generated from user-uploaded materials and context, not a static library

* Difficulty levels calibrated to AI-era interview expectations (even “Easy” expects AI-augmented problem solving)

* Some exercises explicitly require using external AI tools (Cursor, Claude) and then evaluating the output

* Holistic feedback with specific, actionable explanations — not just correct/incorrect

**Product Model**

**Target:** B2C — individual users access the product directly.

**Future:** B2B API layer for bootcamp integration (deferred).

**Monetization:** Deferred. Free for v1 launch.

# **6\. User Stories — MVP (Must Have)**

The MVP consists of 7 user stories that deliver the complete core loop: create an account, set up a learning session, upload materials, configure preferences, generate critical evaluation exercises, take them, and review results with explanations.

## **Story 1: Account Creation**

*As a bootcamp graduate preparing for interviews, I want to create an account so that my learning sessions and quiz history are saved and accessible.*

**Acceptance Criteria**

* User can sign up with email and password

* Password must be 8+ characters

* Verification email sent on signup; account is not usable until email is verified

* User can log in and log out

* After login, user is redirected to their Home Dashboard

* If email is already registered, user sees a clear error

* User can reset password via email

* If verification email doesn’t arrive, user can request a resend

## **Story 2: Create Learning Session**

*As a user, I want to create a learning session by selecting a subject and describing my goal so that generated exercises are relevant to what I’m preparing for.*

**Acceptance Criteria**

* User can create a new session from the Home Dashboard or Session List

* Session creation requires: session name, subject/field (free text), and goal description (free text including context like target companies, languages, role type)

* After creation, user enters the session to optionally upload materials

* Session list shows all sessions with name, subject, and date created

* User can click into any existing session to continue working

* User can edit session name, subject, and goal description after creation

* When session details are edited, existing quiz attempts are preserved; new quizzes reflect updated context

* User can delete a session with confirmation prompt

* No limit on number of sessions

**Home Dashboard (included in this story)**

* After login, user lands on Home Dashboard

* Dashboard displays: total sessions created, total quizzes completed, average score across all quizzes (as percentage), and most practiced subject

* User can navigate to Session List or create a new session directly

* No charts, graphs, or trend data — counts only

## **Story 3: Upload Study Materials**

*As a user, I want to upload study materials to my session so that exercises are generated based on my specific content.*

**Acceptance Criteria**

* Upload is optional — user can generate quizzes based on subject and goal alone

* If no materials are uploaded, LLM generates questions using its training knowledge for the specified subject and goal

* If materials are uploaded, LLM prioritizes uploaded content for question generation

* System clearly indicates whether a quiz was generated from uploaded materials or general knowledge

* User can upload PDF, DOCX, and TXT files up to 20MB each

* User can paste a URL and the system extracts readable content

* Maximum 10 files per session (subject to adjustment based on LLM performance testing)

* User can upload multiple files at once

* User can add additional materials after quizzes have been generated; new quizzes incorporate all materials

* User can view and remove uploaded files within a session

* System confirms successful processing of each upload

* If file is unsupported or extraction fails, user sees a clear error

* Uploaded materials persist across login sessions

* Video file uploads are explicitly out of scope for v1

## **Story 4: Configure Quiz Preferences**

*As a user, I want to select the answer format, difficulty level, and question count so that exercises match how I want to practice.*

**Acceptance Criteria**

* User selects answer format: Multiple Choice, Free Text, or Mixed

* User selects difficulty: Easy, Medium, or Hard

* User selects number of questions: 5 to 20, default is 10

* Defaults if user doesn’t choose: Mixed format, Medium difficulty, 10 questions

* Preferences are set per quiz generation, not locked to the session

* Some questions at any difficulty level may instruct the user to use external AI tools and return with an evaluated answer

**Difficulty Level Definitions (LLM Prompt Spec)**

**Easy — Focused Evaluation:** Spot the bug in a code snippet. Evaluate AI-generated code for issues. Compare two approaches for time/space complexity. Suggest improvements to a function. Contained, single-concept questions — but calibrated to AI-era expectations (not trivial junior-level recall).

**Medium — Applied Analysis:** Predict the output of a code block and explain why. Choose the best algorithm for a problem and justify. Select the optimal data structure with trade-off analysis. Identify weaknesses in a partial architecture. May require using AI tools to research an approach and then evaluate the result.

**Hard — System-Level Thinking:** Design a system for a given scenario and evaluate trade-offs. Critique an AI-generated architecture for scaling issues. Use AI to solve a senior-level problem, then explain whether the approach is optimal and why. Multi-step problems combining code evaluation, architecture, and trade-off analysis.

## **Story 5: Generate Critical Evaluation Exercises**

*As a user, I want to generate exercises from my uploaded materials that test my ability to evaluate code, find bugs, identify better approaches, and think architecturally.*

**Acceptance Criteria**

* Exercises generated based on uploaded materials, session context (subject, goal), and quiz preferences (format, difficulty, count)

* Question types include: spot the bug, evaluate AI-generated code, identify better approaches (time/space complexity), choose the right data structure, architectural trade-off analysis, and “use AI then evaluate the output” prompts

* Question type mix is determined by difficulty level (Easy skews toward focused evaluation, Hard skews toward system design)

* Generated questions are relevant to uploaded materials — not generic CS trivia

* Each question clearly states what the user is expected to do

* If uploaded materials are insufficient, system notifies user and suggests uploading more content or proceeds with general knowledge

* Generation completes within reasonable time (target under 30 seconds; loading indicator shown)

* LLM prompt spec defines question type distribution, quality standards, and difficulty calibration

## **Story 6: Take Exercises**

*As a user, I want to answer each exercise question within the interface so that I can complete the quiz in a structured way.*

**Acceptance Criteria**

* Questions displayed as a scrollable list

* Navigation panel shows all questions with completion status (answered/unanswered)

* User can click any question in the navigation panel to jump directly to it

* MCQ: User selects one answer from options

* Free text: User types or pastes response in a text field

* User can change answers before final submission

* Unanswered questions are highlighted in navigation panel before submission

* User submits all answers at once when ready

* Quiz attempt is saved with timestamp

* If user leaves mid-quiz, progress is saved and they can resume later

## **Story 7: Submit and Review Results with Explanations**

*As a user, I want to see which answers were correct or incorrect with explanations so that I learn from my mistakes and understand the reasoning behind better approaches.*

**Acceptance Criteria**

* After submission, user sees results summary: total score, correct/incorrect/partial credit count

* Each question shows: user’s answer, correct answer, and status (correct/incorrect/partial)

* Each question includes a brief explanation of why the answer is correct or incorrect — focused on reasoning, better approaches, or complexity trade-offs

* For free text: LLM holistically evaluates quality of reasoning, awards partial credit where answer is correct but explanation is weak

* Partial credit feedback includes concise improvement suggestion (1–2 sentences, e.g., “To strengthen this response, mention the O(n log n) trade-off of using a balanced BST.”)

* All feedback is concise and actionable — no long paragraphs

* User can revisit results at any time from within the session

* Results are stored permanently as part of session history

# **7\. User Stories — Deferred**

## **Should Have (v2 Candidates)**

**Story 8: Rich Session Dashboard**

*As a user, I want a detailed session dashboard with quiz attempt counts, last activity date, and completion status so that I can better track my progress within each session.*

**Priority:** Should Have

**Rationale:** Basic session list is included in MVP. Rich dashboard adds visual polish and tracking depth but isn’t required for core functionality.

**Story 9: Retake / New Quiz at Different Difficulty**

*As a user, I want to generate a new quiz within the same session at a different difficulty level so that I can progressively challenge myself on the same material.*

**Priority:** Should Have

**Rationale:** Users can already create new quizzes in the same session with different preferences. This story adds explicit UX for progressive difficulty (e.g., “Try this topic at Hard” prompts). Core capability exists in MVP; this enhances the experience.

**Story 12: Interview Simulation Session**

*As a user, I want to start an interview prep session based on current real-world interview questions and trends for my target role, so that I can practice with questions similar to what companies are actually asking — even without uploading my own materials.*

**Priority:** Should Have

**Rationale:** Requires a fundamentally different data pipeline (web research, curation of current interview trends) versus generating from uploaded content. High value but significant additional scope.

**Story: Google Login**

*As a user, I want to sign up and log in with my Google account so that I can access the product without creating a separate account.*

**Priority:** Should Have

**Rationale:** Reduces signup friction. Email/password with verification is sufficient for MVP.

## **Could Have (v3+ Candidates)**

**Story 10: Analytics and Weak Area Detection**

*As a user, I want to see my performance trends and which areas I’m weakest in so that I can focus my study time effectively.*

**Priority:** Could Have

**Rationale:** Requires defining what “weak areas” means, how to categorize questions by skill, and how to visualize trends. Significant scope beyond basic counts already in MVP Home Dashboard.

## **Won’t Have Yet**

**Story 11: Video Explanation Generation**

*As a user, I want to generate a short explanatory video summarizing my uploaded material so that I can understand the content visually before practicing.*

**Priority:** Won’t Have Yet

**Rationale:** Massive technical undertaking (video generation from text). No validated user demand. The “learning styles” premise (visual vs. textual) lacks strong research support. Revisit only if user research post-launch reveals demand.

**Story: B2B API and Bootcamp Integration**

*As a bootcamp program director, I want to integrate the skills trainer into our curriculum so that students get structured AI-era interview preparation as part of their program.*

**Priority:** Won’t Have Yet

**Rationale:** Requires admin dashboards, cohort management, instructor tools, LMS compatibility. Build the consumer product first, validate it works, then pursue institutional partnerships.

# **8\. Screens and User Flow**

## **Screen Inventory**

| \# | Screen | Description |
| :---- | :---- | :---- |
| 1 | **Sign Up / Login** | Email/password registration with verification. Password reset. Redirect to Home Dashboard on login. |
| 2 | **Home Dashboard** | Summary counts: total sessions, total quizzes, average score, top subject. Navigation to Session List. Create New Session button. |
| 3 | **Session List** | All sessions listed with name, subject, date created. Click to enter session. Delete with confirmation. |
| 4 | **Create Session** | Form: session name, subject, goal description, optional file uploads. Single-step creation. |
| 5 | **Session Dashboard** | Hub for each session: session details (editable), uploaded materials (view/add/remove), quiz history with date/difficulty/score per attempt, Generate New Quiz button. |
| 6 | **Quiz Taking** | Scrollable question list with navigation panel showing answered/unanswered status. MCQ selection or free text input. Submit All button. |
| 7 | **Quiz Results** | Score summary at top. Per-question review: user answer, correct answer, status, concise explanation. Also serves as the view for reviewing past attempts. |

## **Core User Flow**

Login → Home Dashboard → Session List → Create Session (with optional uploads) → Session Dashboard → Configure Quiz Preferences → Generate → Take Quiz → Submit → Quiz Results → Back to Session Dashboard (new attempt appears in history).

From the Session Dashboard, users can also: review any past quiz attempt, edit session details, upload additional materials, or generate a new quiz with different preferences.

# **9\. Success Metrics**

| Metric | Definition | Target | Timeframe |
| :---- | :---- | :---- | :---- |
| **Acquisition** | Verified account signups | 30 signups | First month |
| **Activation** | User completes first quiz and reviews results | 50% of signups | Within 14 days of signup |
| **Retention** | User completes a second quiz (same or different session) | 40% of activated users | Within 30 days of first quiz |
| **Revenue** | Monetization model | Deferred | Post-v1 |
| **Referral** | Activated users who share with at least one person | 10% of activated | Ongoing |

**Key Activation Metric:** A user has experienced the core value when they complete a quiz AND review the results with explanations. Signup alone or quiz generation alone does not count as activation.

**Distribution Plan:** Initial users sourced from bootcamp cohort (direct sharing) and LinkedIn posts. Track source via signup attribution.

# **10\. Riskiest Assumptions**

## **Risk 1: Unvalidated Problem (Critical)**

**Assumption:** Bootcamp graduates need and will actively use a product that trains code evaluation and architectural thinking skills for interview preparation.

**Why it matters:** The entire product is built on personal experience and 3 peer conversations. If this is not a widespread, acute pain point, the product will see minimal usage regardless of execution quality.

**How to test:** Post-launch, conduct structured interviews with 10–15 bootcamp graduates. Track activation rate — if less than 30% of signups complete a quiz within 14 days, the problem may not be painful enough to drive action.

## **Risk 2: LLM Question Quality (Critical)**

**Assumption:** The LLM can consistently generate high-quality critical evaluation questions that feel relevant, challenging, and realistic — not generic or shallow.

**Why it matters:** Question quality IS the product. If exercises feel like generic CS trivia or poorly constructed scenarios, users will revert to LeetCode or raw ChatGPT.

**How to test:** Before launch, generate 50+ questions across all difficulty levels. Personally review every one. Have 3–5 cohort members take sample quizzes and provide feedback. Iterate on the LLM prompt spec until quality is consistent.

## **Risk 3: Free Text Grading Accuracy (High)**

**Assumption:** The LLM can holistically evaluate free-text responses and provide specific, actionable feedback with appropriate partial credit.

**Why it matters:** If grading feels arbitrary or feedback is generic (“good job” / “needs improvement”), the learning value collapses and users won’t trust the system.

**How to test:** Write 10 free-text answers at varying quality levels. Run through the grading system. Verify: Does it award partial credit appropriately? Does feedback reference the specific content of the answer? Iterate until grading feels fair and instructive.

## **Risk 4: Upload Friction (Medium)**

**Assumption:** Users will have study materials ready to upload and will be motivated to do so.

**Mitigation already in place:** Uploads are optional in MVP. Users can generate quizzes from subject and goal context alone. This significantly reduces the barrier to first quiz.

# **11\. Out of Scope for v1**

The following are explicitly excluded from the MVP to maintain focus on the core value proposition:

* Video explanation generation from study materials

* Interview simulation sessions based on real-world internet research

* Analytics, performance trends, and weak area detection (beyond basic Home Dashboard counts)

* Google / social login (email/password only in v1)

* B2B API and bootcamp institutional integration

* Admin dashboards, instructor tools, or cohort management

* Video file uploads

* Mobile-native application (web-based only)

* Monetization / payment processing

* Collaborative or social features (study groups, leaderboards)

* Charts, graphs, or trend visualizations