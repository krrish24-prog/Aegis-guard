import React from 'react';

interface SecurityScoreCircleProps {
  score: number;
  isSafe: boolean;
}

const SecurityScoreCircle: React.FC<SecurityScoreCircleProps> = ({ score, isSafe }) => {
  const getColor = (score: number, isSafe: boolean) => {
    if (!isSafe) return '#ef4444'; // Red for critical/threat
    return '#22c55e'; // Green for safe
  };

  const color = getColor(score, isSafe);
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg className="w-10 h-10 transform -rotate-90">
        <circle
          className="text-gray-300"
          strokeWidth="3"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx="20"
          cy="20"
        />
        <circle
          className="transition-all duration-500 ease-out"
          strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          stroke={color}
          fill="transparent"
          r={radius}
          cx="20"
          cy="20"
        />
      </svg>
      <span className="absolute text-[10px] font-bold text-gray-700">{score}</span>
    </div>
  );
};

export default SecurityScoreCircle;
