import { Link, Navigate } from 'react-router-dom';

import { useAppSelector } from '@/store/store';
import { selectIsAuthenticated } from '@/store/slices/auth.slice';

import styles from './LandingPage.module.css';

const EXERCISE_TYPES = [
  {
    name: 'Spot the Bug',
    description:
      'Find bugs, anti-patterns, and security issues in real code snippets.',
  },
  {
    name: 'Evaluate AI Output',
    description:
      "You get a prompt and the AI's response. Find what the AI got wrong — missing edge cases, silent failures, incorrect assumptions.",
  },
  {
    name: 'Compare Approaches',
    description:
      'Two implementations of the same problem. Justify which is better and why — complexity, readability, maintainability.',
  },
  {
    name: 'Choose the Right Tool',
    description:
      'A scenario with constraints. Pick the right algorithm, data structure, or pattern with explicit trade-off justification.',
  },
  {
    name: 'Architectural Trade-off',
    description:
      'A system design problem or partial architecture. Reason about weaknesses and defend your decisions.',
  },
  {
    name: 'AI Collaboration',
    description:
      'Use an AI tool to solve a real problem, then evaluate its output — is it correct, optimal, scalable, production-ready?',
  },
  {
    name: 'Prompt Construction',
    description:
      "Write the prompt you'd give an AI coding assistant to implement something correctly. Tests whether you anticipate edge cases, constraints, and what the AI would miss without explicit instruction.",
  },
];

const STEPS = [
  {
    number: '01',
    title: 'Upload your study material',
    description:
      "PDF, notes, or any document. Or just describe what you're studying.",
  },
  {
    number: '02',
    title: 'AI generates critical thinking exercises',
    description:
      'Not recall questions. Exercises from the 7 types above, tailored to your content and difficulty level.',
  },
  {
    number: '03',
    title: 'Get graded with real feedback',
    description:
      'Detailed explanations. Partial credit. Specific improvement tips — not just correct or incorrect.',
  },
];

const AUDIENCES = [
  {
    title: 'Bootcamp Graduate',
    description:
      'You finished the course. You can build apps. But technical interviews ask something different.',
  },
  {
    title: 'CS Student',
    description:
      "You know the theory. But you've never practiced evaluating code or reviewing AI output.",
  },
  {
    title: 'Junior Developer',
    description:
      "You're in your first job. You need to level up from writing code to reviewing and architecting it.",
  },
];

const LandingPage = () => {
  const isAuthenticated = useAppSelector(selectIsAuthenticated);

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className={styles.page}>
      {/* Navbar */}
      <header className={styles.navbar}>
        <span className={styles.logo}>Quizzly</span>
        <Link to="/login" className={styles.navCta}>
          Start Practicing Now
        </Link>
      </header>

      {/* Hero */}
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <p className={styles.eyebrow}>AI-native engineering</p>
          <h1 className={styles.headline}>
            Stop memorising.
            <br />
            Start thinking like a senior engineer.
          </h1>
          <p className={styles.subheadline}>
            LeetCode trains you to write code. Quizzly trains you to evaluate it
            — spot bugs, critique AI output, reason about architecture.
          </p>
          <Link to="/login" className={styles.heroCta}>
            Start Practicing Now
          </Link>
          <p className={styles.frictionReducer}>
            No credit card required. Works with any subject.
          </p>
        </div>
      </section>

      {/* Exercise Types */}
      <section className={styles.exerciseTypes}>
        <div className={styles.exerciseTypesInner}>
          <h2 className={styles.exerciseTypesHeading}>
            7 types of exercises. Not definitions. Not recall.
          </h2>
          <div className={styles.exerciseTypesGrid}>
            {EXERCISE_TYPES.map((type) => (
              <div key={type.name} className={styles.exerciseTypeCard}>
                <h3 className={styles.exerciseTypeName}>{type.name}</h3>
                <p className={styles.exerciseTypeDescription}>
                  {type.description}
                </p>
              </div>
            ))}
          </div>
          <p className={styles.exerciseTypesTagline}>
            Difficulty controls which types appear and how deep the reasoning
            must go.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className={styles.steps}>
        <div className={styles.stepsInner}>
          <h2 className={styles.stepsHeading}>How it works</h2>
          <div className={styles.stepsGrid}>
            {STEPS.map((step) => (
              <div key={step.number} className={styles.stepCard}>
                <span className={styles.stepNumber}>{step.number}</span>
                <h3 className={styles.stepTitle}>{step.title}</h3>
                <p className={styles.stepDescription}>{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Who It's For */}
      <section className={styles.audience}>
        <div className={styles.audienceInner}>
          <h2 className={styles.audienceHeading}>Who it's for</h2>
          <div className={styles.audienceGrid}>
            {AUDIENCES.map((persona) => (
              <div key={persona.title} className={styles.audienceCard}>
                <h3 className={styles.audienceTitle}>{persona.title}</h3>
                <p className={styles.audienceDescription}>
                  {persona.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className={styles.bottomCta}>
        <div className={styles.bottomCtaInner}>
          <h2 className={styles.bottomCtaHeading}>
            The industry needs AI-native engineers. Start becoming one.
          </h2>
          <p className={styles.bottomCtaSubtext}>
            Upload what you're studying. Generate your first exercise in under a
            minute.
          </p>
          <Link to="/login" className={styles.heroCta}>
            Start Practicing Now
          </Link>
          <p className={styles.frictionReducer}>No credit card required.</p>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <span>© {new Date().getFullYear()} Quizzly</span>
      </footer>
    </div>
  );
};

export default LandingPage;
