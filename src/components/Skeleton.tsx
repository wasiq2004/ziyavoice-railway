import React from 'react';

interface SkeletonProps {
    className?: string;
    width?: string | number;
    height?: string | number;
    variant?: 'text' | 'rect' | 'circle' | 'rounded';
    animation?: 'pulse' | 'wave' | 'none';
}

const Skeleton: React.FC<SkeletonProps> = ({
    className = '',
    width,
    height,
    variant = 'rounded',
    animation = 'pulse',
}) => {
    const baseStyles = 'bg-slate-200 dark:bg-slate-800';

    const variantStyles = {
        text: 'rounded',
        rect: '',
        circle: 'rounded-full',
        rounded: 'rounded-xl',
    };

    const animationStyles = {
        pulse: 'animate-pulse',
        wave: 'relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_2s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent',
        none: '',
    };

    const styles: React.CSSProperties = {
        width: width,
        height: height,
    };

    return (
        <div
            className={`${baseStyles} ${variantStyles[variant]} ${animationStyles[animation]} ${className}`}
            style={styles}
        />
    );
};

export default Skeleton;
