import { useState, useEffect, useRef } from 'react';

export const useAutoTypewriter = (
  texts: string[],
  options: { speed?: number; deleteSpeed?: number; pauseDuration?: number } = {}
) => {
  const { speed = 80, deleteSpeed = 40, pauseDuration = 2000 } = options;
  const [displayedText, setDisplayedText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [textIndex, setTextIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const currentText = texts[textIndex];

    if (!isDeleting && charIndex < currentText.length) {
      timer.current = setTimeout(() => {
        setDisplayedText(currentText.slice(0, charIndex + 1));
        setCharIndex((i) => i + 1);
      }, speed);
    } else if (!isDeleting && charIndex === currentText.length) {
      timer.current = setTimeout(() => setIsDeleting(true), pauseDuration);
    } else if (isDeleting && charIndex > 0) {
      timer.current = setTimeout(() => {
        setDisplayedText(currentText.slice(0, charIndex - 1));
        setCharIndex((i) => i - 1);
      }, deleteSpeed);
    } else if (isDeleting && charIndex === 0) {
      setIsDeleting(false);
      setTextIndex((i) => (i + 1) % texts.length);
    }

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [charIndex, isDeleting, textIndex, texts, speed, deleteSpeed, pauseDuration]);

  return displayedText;
};