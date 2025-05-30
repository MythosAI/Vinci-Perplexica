import { searchSearxng } from '@/lib/searxng';
import { ChatOpenAI } from '@langchain/openai';
import { getOpenaiApiKey, getNewsApiKey } from '@/lib/config';

// TODO: have a way to remember which articles have story groups generated for them
// across calls to the API

interface NewsArticle {
  title: string;
  content: string;
  url: string;
  thumbnail?: string;
  source: string;
  publishDate?: string;
  topics?: string[];
}

interface GroupedStory {
  mainTitle: string;
  summary: string;
  keyPoints: string[];
  articles: NewsArticle[];
  bias: {
    left: number;
    center: number;
    right: number;
  };
}

// Map of news sources to their bias ratings
const sourceBiasMap: Record<string, 'left' | 'center' | 'right'> = {
  'reuters.com': 'center',
  'bloomberg.com': 'center',
  'wsj.com': 'right',
  'ft.com': 'center',
  'foxbusiness.com': 'right',
  'marketwatch.com': 'center',
  'businessinsider.com': 'left',
  'forbes.com': 'center',
  'thestreet.com': 'center'
};

// Add configuration interface
interface StoryGroupConfig {
  numStoryGroups: number;  // Number of story groups to generate
  articlesPerGroup: number; // Number of related articles per group
  seedSource?: string;     // Optional: specify seed source (defaults to WSJ)
}

// Modify getTrendingNews to fetch more comprehensive results
async function getTrendingNews(): Promise<NewsArticle[]> {
  console.log('Fetching trending news from NewsAPI...');
  const apiKey = getNewsApiKey();
  if (!apiKey) {
    throw new Error('NewsAPI key not found in environment variables');
  }

  try {
    // NewsAPI endpoint with more parameters for comprehensive results
    const response = await fetch(
      `https://newsapi.org/v2/top-headlines?` +
      `category=business&` +
      `language=en&` +
      `country=us&` +
      `pageSize=100&` + // Get maximum number of results
      `sortBy=popularity&` + // Sort by popularity
      `apiKey=${apiKey}`
    );

    if (!response.ok) {
      throw new Error(`NewsAPI error: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.articles || data.articles.length === 0) {
      console.log('No trending news found');
      return [];
    }

    // Log all headlines for debugging
    console.log('\n=== ALL TOP HEADLINES ===');
    data.articles.forEach((article: any, index: number) => {
      console.log(`${index + 1}. ${article.title} (${article.source.name})`);
    });

    // Convert NewsAPI format to our NewsArticle format
    return data.articles.map((article: any) => ({
      title: article.title,
      content: article.description || article.title,
      url: article.url,
      thumbnail: article.urlToImage,
      source: article.source.name,
      publishDate: article.publishedAt
    }));
  } catch (error) {
    console.error('Error fetching trending news:', error);
    return [];
  }
}

// Modify getSeedArticle to use NewsAPI trending
async function getSeedArticle(): Promise<NewsArticle | null> {
  console.log('Getting seed article from NewsAPI trending...');
  try {
    const trendingNews = await getTrendingNews();
    
    if (trendingNews.length === 0) {
      console.log('No trending news available');
      return null;
    }

    // Get the first trending article as seed
    const seedArticle = trendingNews[0];
    console.log('Selected seed article:', seedArticle.title);
    return seedArticle;
  } catch (error) {
    console.error('Error getting seed article:', error);
    return null;
  }
}

// Extract topics from seed article
async function extractTopicsFromSeed(article: NewsArticle): Promise<string[]> {
  console.log('Extracting topics from seed article...');
  const openaiApiKey = getOpenaiApiKey();
  if (!openaiApiKey) {
    throw new Error('OpenAI API key not found in config.toml');
  }

  const llm = new ChatOpenAI({ 
    openAIApiKey: openaiApiKey,
    temperature: 0 
  });
  
  const result = await llm.invoke(`
    You are a financial news topic extractor. Your task is to identify the main topics discussed in the article.
    Return exactly 3 phrases that best describe what this article is about.
    Each phrase should be 2-4 words long and capture a key aspect of the story.
    Format your response as a comma-separated list of phrases.

    Article:
    ${article.title}
    ${article.content}

    Topics:
  `);
  
  const topics = (result.content as string)
    .split(',')
    .map(topic => topic.trim().toLowerCase())
    .filter(topic => topic.length > 0);

  console.log('Extracted topics:', topics);
  return topics;
}

// Modify findRelatedArticles to accept number of articles parameter
async function findRelatedArticles(topics: string[], numArticles: number): Promise<NewsArticle[]> {
  console.log(`Searching for ${numArticles} related articles...`);
  const searchQuery = topics.join(' ');
  
  const financialSources = [
    'reuters.com',
    'bloomberg.com',
    'ft.com',
    'marketwatch.com'
  ];

  const searchPromises = financialSources.map(async (source) => {
    try {
      // const response = await searchSearxng(`site:${source} ${searchQuery}`, {
      //   engines: ['bing news'],
      //   pageno: 1,
      // });
      const response = await searchSearxng(`${searchQuery}`, {
        engines: ['bing news'],
        pageno: 1,
      });

      // Get unique articles by URL
      const seenUrls = new Set();
      const uniqueResults = response.results.filter(article => {
        const normalizedUrl = new URL(article.url);
        normalizedUrl.search = '';
        normalizedUrl.hash = '';
        const urlKey = normalizedUrl.toString();
        
        if (seenUrls.has(urlKey)) return false;
        seenUrls.add(urlKey);
        return true;
      }).slice(0, Math.ceil(numArticles / financialSources.length)); // Distribute articles across sources

      return uniqueResults.map(article => ({
        ...article,
        source,
        content: article.content || article.title
      }));
    } catch (error) {
      console.error(`Error fetching from ${source}:`, error);
      return [];
    }
  });

  const results = await Promise.all(searchPromises);
  return results.flat().slice(0, numArticles); // Ensure we don't return more than requested
}

// Calculate bias for a group of articles
function calculateBias(articles: NewsArticle[]): { left: number; center: number; right: number } {
  const biasCount = {
    left: 0,
    center: 0,
    right: 0
  };
  
  let totalSources = 0;
  
  articles.forEach(article => {
    const domain = new URL(article.url).hostname.replace('www.', '');
    const bias = sourceBiasMap[domain];
    
    if (bias) {
      biasCount[bias]++;
      totalSources++;
    }
  });
  
  // Convert to percentages
  return {
    left: Math.round((biasCount.left / totalSources) * 100) || 0,
    center: Math.round((biasCount.center / totalSources) * 100) || 0,
    right: Math.round((biasCount.right / totalSources) * 100) || 0
  };
}

// Generate story group with summary and key points
async function generateStoryGroup(seedArticle: NewsArticle, relatedArticles: NewsArticle[]): Promise<GroupedStory> {
  console.log('Generating story group...');
  console.log('\n=== SEED ARTICLE ===');
  console.log(`Title: ${seedArticle.title}`);
  console.log(`Source: ${seedArticle.source}`);
  console.log(`Content: ${seedArticle.content}`);
  
  console.log('\n=== RELATED ARTICLES ===');
  relatedArticles.forEach((article, idx) => {
    console.log(`\nArticle ${idx + 1}:`);
    console.log(`Title: ${article.title}`);
    console.log(`Source: ${article.source}`);
    console.log(`Content: ${article.content}`);
  });

  const openaiApiKey = getOpenaiApiKey();
  if (!openaiApiKey) {
    throw new Error('OpenAI API key not found in config.toml');
  }

  const llm = new ChatOpenAI({ 
    openAIApiKey: openaiApiKey,
    temperature: 0 
  });

  // Generate summary
  console.log('\n=== GENERATING SUMMARY ===');
  const summaryResult = await llm.invoke(`
    Write a comprehensive summary of this news story based on the following articles.
    Focus on the key developments and their implications.

    Articles:
    ${[seedArticle, ...relatedArticles].map(a => `${a.title}\n${a.content}`).join('\n\n')}

    Summary:
  `);
  console.log('\nGenerated Summary:');
  console.log(summaryResult.content);

  // Extract key points
  console.log('\n=== EXTRACTING KEY POINTS ===');
  const keyPointsResult = await llm.invoke(`
    Extract the key points from these articles.
    Focus on the most important facts, developments, and implications.
    Format each point as a bullet point.

    Articles:
    ${[seedArticle, ...relatedArticles].map(a => `${a.title}\n${a.content}`).join('\n\n')}

    Key Points:
  `);
  console.log('\nGenerated Key Points:');
  console.log(keyPointsResult.content);

  const keyPoints = (keyPointsResult.content as string)
    .split('\n')
    .filter(line => line.trim().startsWith('•') || line.trim().startsWith('-'))
    .map(line => line.trim().replace(/^[•-]\s*/, ''));

  return {
    mainTitle: seedArticle.title,
    summary: summaryResult.content as string,
    keyPoints,
    articles: [seedArticle, ...relatedArticles],
    bias: calculateBias([seedArticle, ...relatedArticles])
  };
}

// Main route handler with configurable parameters
export const GET = async (req: Request) => {
  try {
    console.log('Starting finance news fetch...');
    
    // Parse URL parameters
    const url = new URL(req.url);
    const showAllHeadlines = url.searchParams.get('showAllHeadlines') === 'true';
    
    const config: StoryGroupConfig = {
      numStoryGroups: parseInt(url.searchParams.get('numGroups') || '2'),
      articlesPerGroup: parseInt(url.searchParams.get('articlesPerGroup') || '5'),
    };

    // If showAllHeadlines is true, just return all headlines
    if (showAllHeadlines) {
      const allHeadlines = await getTrendingNews();
      return Response.json(
        {
          headlines: allHeadlines,
          total: allHeadlines.length
        },
        {
          status: 200
        }
      );
    }

    // Fetch all trending articles once
    const allTrending = await getTrendingNews();
    const storyGroups: GroupedStory[] = [];
    const processedUrls = new Set<string>();

    // Use the first N unique trending articles as seeds
    let seedIndex = 0;
    for (let i = 0; i < config.numStoryGroups; i++) {
      // Find the next unique seed article
      let seedArticle = null;
      while (seedIndex < allTrending.length) {
        const candidate = allTrending[seedIndex++];
        if (candidate && !processedUrls.has(candidate.url)) {
          seedArticle = candidate;
          break;
        }
      }
      if (!seedArticle) {
        console.log(`No more unique seed articles found for group ${i + 1}`);
        continue;
      }
      processedUrls.add(seedArticle.url);

      // Extract topics
      const topics = await extractTopicsFromSeed(seedArticle);
      
      // Find related articles
      const relatedArticles = await findRelatedArticles(topics, config.articlesPerGroup);
      
      // Generate story group
      const storyGroup = await generateStoryGroup(seedArticle, relatedArticles);
      storyGroups.push(storyGroup);
    }

    return Response.json(
      {
        stories: storyGroups,
        config: {
          requestedGroups: config.numStoryGroups,
          actualGroups: storyGroups.length,
          articlesPerGroup: config.articlesPerGroup
        }
      },
      {
        status: 200
      }
    );
  } catch (err) {
    console.error(`An error occurred in finance news route:`, err);
    return Response.json(
      {
        message: 'An error has occurred',
        error: err instanceof Error ? err.message : 'Unknown error'
      },
      {
        status: 500
      }
    );
  }
};