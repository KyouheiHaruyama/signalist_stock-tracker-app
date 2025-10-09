import { useCallback, useEffect, useRef} from "react";

export function useDebounce(callback: () => void, delay: number) {
    const callbackRef = useRef(callback);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        callbackRef.current = callback;
    }, [callback]);

    return useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => callbackRef.current(), delay);
    }, [delay]);
}