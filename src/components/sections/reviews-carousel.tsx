"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import styles from "./reviews-carousel.module.css";

type Labels = {
  previous: string;
  next: string;
  instructions: string;
  carousel: string;
};

export function ReviewsCarousel({
  children,
  labels,
}: {
  children: ReactNode;
  labels: Labels;
}) {
  const track = useRef<HTMLUListElement>(null);

  const [edges, setEdges] = useState({
    start: true,
    end: false,
  });

  useEffect(() => {
    const element = track.current;

    if (!element) return;

    const update = () => {
      const maxScrollLeft = element.scrollWidth - element.clientWidth;

      // Small tolerance for sub-pixel positioning, gaps and scroll-snap.
      const tolerance = 4;

      setEdges({
        start: element.scrollLeft <= tolerance,
        end: element.scrollLeft >= maxScrollLeft - tolerance,
      });
    };

    update();

    element.addEventListener("scroll", update, {
      passive: true,
    });

    const observer = new ResizeObserver(update);
    observer.observe(element);

    return () => {
      element.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  function navigate(direction: -1 | 1) {
    const element = track.current;

    if (!element) return;

    const cards = Array.from(element.children) as HTMLElement[];

    const origin = cards[0]?.offsetLeft ?? 0;

    const positions = cards.map((card) => card.offsetLeft - origin);

    const target =
      direction === 1
        ? (positions.find((position) => position > element.scrollLeft + 2) ??
          element.scrollWidth)
        : (positions.findLast(
            (position) => position < element.scrollLeft - 2,
          ) ?? 0);

    element.scrollTo({
      left: target,
      behavior: "auto",
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }

    event.preventDefault();

    if (event.key === "ArrowLeft") {
      if (!edges.start) {
        navigate(-1);
      }

      return;
    }

    if (!edges.end) {
      navigate(1);
    }
  }

  return (
    <div className="mt-8 min-w-0 sm:mt-10">
      <div className="mb-5 flex items-center justify-between gap-4">
        <p
          id="buyer-reviews-instructions"
          className="text-muted-foreground text-sm"
        >
          {labels.instructions}
        </p>

        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            aria-label={labels.previous}
            aria-controls="buyer-reviews-track"
            disabled={edges.start}
            onClick={() => navigate(-1)}
            className={styles.arrow}
          >
            <span aria-hidden="true">←</span>
          </button>

          <button
            type="button"
            aria-label={labels.next}
            aria-controls="buyer-reviews-track"
            disabled={edges.end}
            onClick={() => navigate(1)}
            className={styles.arrow}
          >
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>

      <ul
        ref={track}
        id="buyer-reviews-track"
        aria-label={labels.carousel}
        aria-describedby="buyer-reviews-instructions"
        tabIndex={0}
        onKeyDown={onKeyDown}
        className={styles.track}
      >
        {children}
      </ul>
    </div>
  );
}
