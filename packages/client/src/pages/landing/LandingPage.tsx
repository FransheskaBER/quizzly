import { Link, Navigate } from 'react-router-dom';

import { useAppSelector } from '@/store/store';
import { selectIsAuthenticated } from '@/store/slices/auth.slice';

import styles from './LandingPage.module.css';

const STEPS = [
  {
    number: '01',
    title: 'Upload your study material',
    description:
      'Drop in a PDF, paste notes, or upload any document. Quizzly extracts the content and gets it ready for your session.',
  },
  {
    number: '02',
    title: 'AI generates targeted questions',
    description:
      'Claude analyses your material and produces multiple-choice and free-text questions that go beyond simple recall — testing how you think, not just what you remember.',
  },
  {
    number: '03',
    title: 'Get graded with real feedback',
    description:
      'Submit your answers and receive instant, detailed feedback. Understand exactly where your reasoning is strong and where it needs work.',
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
          Get started
        </Link>
      </header>

      {/* Hero */}
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <p className={styles.eyebrow}>AI-powered quiz generation</p>
          <h1 className={styles.headline}>
            Stop memorising.
            <br />
            Start thinking like a senior engineer.
          </h1>
          <p className={styles.subheadline}>
            LeetCode trains you to write code. Quizzly trains you to evaluate it — the skill
            technical interviews actually test.
          </p>
          <Link to="/login" className={styles.heroCta}>
            Get started for free
          </Link>
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

      {/* Bottom CTA */}
      <section className={styles.bottomCta}>
        <div className={styles.bottomCtaInner}>
          <h2 className={styles.bottomCtaHeading}>Ready to level up your interview prep?</h2>
          <p className={styles.bottomCtaSubtext}>
            Upload your first study material and generate a quiz in under a minute.
          </p>
          <Link to="/login" className={styles.heroCta}>
            Get started for free
          </Link>
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
