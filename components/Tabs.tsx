
import React from 'react';

interface TabsProps {
  tabs: string[];
  selectedTab: string;
  onSelectTab: (tab: string) => void;
  variant?: 'pills' | 'underline';
  size?: 'sm' | 'md';
}

const Tabs: React.FC<TabsProps> = ({ tabs, selectedTab, onSelectTab, variant = 'pills', size = 'md' }) => {
  const getPillBaseClasses = () => "font-medium transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-secondary";
  const getPillSizeClasses = () => size === 'sm' ? "px-3 py-1 text-sm rounded-md" : "px-4 py-2 text-base rounded-lg";
  const getPillStateClasses = (tab: string) => {
      return selectedTab === tab
        ? "bg-primary text-white shadow"
        : "text-gray-600 hover:bg-gray-200";
  };
  
  const getUnderlineBaseClasses = () => "font-medium transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-inset focus:ring-secondary pb-2 border-b-2";
  const getUnderlineSizeClasses = () => size === 'sm' ? "text-sm" : "text-base";
  const getUnderlineStateClasses = (tab: string) => {
    return selectedTab === tab
        ? "border-primary text-primary"
        : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700";
  };


  if (variant === 'underline') {
      return (
          <div className="flex space-x-4 sm:space-x-6 px-4 sm:px-6">
              {tabs.map(tab => (
                  <button
                      key={tab}
                      onClick={() => onSelectTab(tab)}
                      className={`${getUnderlineBaseClasses()} ${getUnderlineSizeClasses()} ${getUnderlineStateClasses(tab)}`}
                  >
                      {tab}
                  </button>
              ))}
          </div>
      );
  }

  return (
    <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
      {tabs.map(tab => (
        <button
          key={tab}
          onClick={() => onSelectTab(tab)}
          className={`${getPillBaseClasses()} ${getPillSizeClasses()} ${getPillStateClasses(tab)}`}
        >
          {tab}
        </button>
      ))}
    </div>
  );
};

export default Tabs;
