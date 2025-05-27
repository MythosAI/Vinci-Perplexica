'use client';

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(res => res.json());

interface GroupedStory {
  mainTitle: string;
  summary: string;
  keyPoints: string[];
  articles: {
    title: string;
    content: string;
    url: string;
    thumbnail?: string;
    source: string;
    publishDate?: string;
  }[];
  bias: {
    left: number;
    center: number;
    right: number;
  };
}

export default function FinanceNews() {
  const [config, setConfig] = useState({
    numGroups: 2,
    articlesPerGroup: 5,
    showAllHeadlines: false
  });

  // Get the showAllHeadlines parameter from the URL
  useEffect(() => {
    const url = new URL(window.location.href);
    const showAllHeadlines = url.searchParams.get('showAllHeadlines') === 'true';
    setConfig(prev => ({
      ...prev,
      showAllHeadlines
    }));
  }, []);

  const { data, error, isLoading } = useSWR<{ stories: GroupedStory[] } | { headlines: NewsArticle[], total: number }>(
    `/api/finance-news?` +
    `numGroups=${config.numGroups}&` +
    `articlesPerGroup=${config.articlesPerGroup}&` +
    `showAllHeadlines=${config.showAllHeadlines}`,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      refreshInterval: 300000,
    }
  );

  const handleConfigChange = (key: string, value: string | number | boolean) => {
    setConfig(prev => ({
      ...prev,
      [key]: value
    }));
  };

  if (error) return <div>Failed to load</div>;
  if (isLoading) return <div>Loading...</div>;

  // Check if we're showing all headlines or story groups
  const isShowingHeadlines = 'headlines' in data;
  const headlines = isShowingHeadlines ? data.headlines : [];
  const stories = !isShowingHeadlines ? data.stories : [];

  return (
    <div className="max-w-screen-xl mx-auto px-4">
      <div className="flex flex-col pt-4">
        <div className="flex items-center">
          <Search />
          <h1 className="text-3xl font-medium p-2">Financial News</h1>
        </div>
        
        <div className="flex gap-4 my-4">
          {!config.showAllHeadlines && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700">Number of Groups</label>
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={config.numGroups}
                  onChange={(e) => handleConfigChange('numGroups', parseInt(e.target.value))}
                  className="mt-1 block w-20 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Articles per Group</label>
                <input
                  type="number"
                  min="2"
                  max="10"
                  value={config.articlesPerGroup}
                  onChange={(e) => handleConfigChange('articlesPerGroup', parseInt(e.target.value))}
                  className="mt-1 block w-20 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                />
              </div>
            </>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700">View Mode</label>
            <select
              value={config.showAllHeadlines ? 'headlines' : 'groups'}
              onChange={(e) => {
                const newValue = e.target.value === 'headlines';
                handleConfigChange('showAllHeadlines', newValue);
                // Update URL
                const url = new URL(window.location.href);
                if (newValue) {
                  url.searchParams.set('showAllHeadlines', 'true');
                } else {
                  url.searchParams.delete('showAllHeadlines');
                }
                window.history.pushState({}, '', url.toString());
              }}
              className="mt-1 block w-40 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            >
              <option value="groups">Story Groups</option>
              <option value="headlines">All Headlines</option>
            </select>
          </div>
        </div>

        <hr className="border-t border-[#2B2C2C] my-4 w-full" />
      </div>

      {isShowingHeadlines ? (
        // Display all headlines
        <div className="space-y-4">
          {headlines.map((article, index) => (
            <div key={index} className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold mb-2">{article.title}</h2>
              <p className="text-sm text-gray-500 mb-2">{article.source}</p>
              <p className="mb-4">{article.content}</p>
              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:text-blue-700"
              >
                Read more
              </a>
            </div>
          ))}
        </div>
      ) : (
        // Display story groups (existing code)
        <div className="space-y-6">
          {stories.map((story, index) => (
            <div key={index} className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold mb-4">{story.mainTitle}</h2>
              
              {/* Bias Indicator */}
              <div className="flex items-center gap-4 mb-4">
                <div className="flex-1 h-2 bg-gray-200 rounded">
                  <div 
                    className="h-full bg-gradient-to-r from-blue-500 via-gray-500 to-red-500"
                    style={{
                      background: `linear-gradient(to right, 
                        blue ${story.bias.left}%, 
                        gray ${story.bias.center}%, 
                        red ${story.bias.right}%)`
                    }}
                  />
                </div>
                <span className="text-sm text-gray-500">
                  {story.articles.length} sources
                </span>
              </div>

              {/* Key Points */}
              <div className="mb-4">
                <h3 className="font-semibold mb-2">Key Points:</h3>
                <ul className="list-disc list-inside space-y-1">
                  {story.keyPoints.map((point, i) => (
                    <li key={i}>{point}</li>
                  ))}
                </ul>
              </div>

              {/* Related Articles */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {story.articles.map((article, i) => (
                  <a
                    key={i}
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg p-4"
                  >
                    {article.thumbnail && (
                      <img
                        src={article.thumbnail}
                        alt={article.title}
                        className="w-full h-40 object-cover rounded-lg mb-2"
                      />
                    )}
                    <h4 className="font-medium mb-1">{article.title}</h4>
                    <p className="text-sm text-gray-500">{article.source}</p>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}