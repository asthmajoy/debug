import React from 'react';

const Loader = ({ size = 'medium', text = 'Loading...' }) => {
  let spinnerSize;
  
  switch (size) {
    case 'small':
      spinnerSize = 'h-6 w-6';
      break;
    case 'large':
      spinnerSize = 'h-16 w-16';
      break;
    case 'medium':
    default:
      spinnerSize = 'h-10 w-10';
      break;
  }
  
  return (
    <div className="flex flex-col items-center justify-center p-4">
      <div className={`animate-spin rounded-full border-t-2 border-b-2 border-indigo-500 ${spinnerSize}`}></div>
      {text && <p className="mt-2 text-gray-600">{text}</p>}
    </div>
  );
};

export default Loader;