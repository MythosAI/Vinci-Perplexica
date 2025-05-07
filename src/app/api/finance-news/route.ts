import { searchSearxng } from '@/lib/searxng';
import { ChatOpenAI } from '@langchain/openai';
import { getOpenaiApiKey } from '@/lib/config';
import { GroupedStory, generateSummary, extractKeyPoints, getMostRepresentativeTitle, calculateBias} from '@/lib/utils/articleGrouping';

const financialSources = [
  'reuters.com',
  'bloomberg.com',
  'ft.com',
  'wsj.com',
  'cnbc.com',
  'marketwatch.com'
];

// Add these interfaces
interface NewsArticle {
  title: string;
  content: string;
  url: string;
  thumbnail?: string;
  source: string;
  publishDate?: string;
  topics?: string[]; // Added for our topic-based grouping
}
// Reduce topics to focus on more similar content for testing
const topics = ['tariff','finance', 'markets'];

async function extractTopics(article: NewsArticle): Promise<string[]> {
  console.log('Extracting topics from article...');
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
    Return a list of 2-3 specific topics that best describe what the article is about.
    Each topic should be a short phrase (2-4 words) that captures the main subject.
    Format your response as a comma-separated list of topics.

    Article:
    ${article.title}
    ${article.content}

    Topics:
  `);
  
  // Split the response into individual topics and clean them
  return (result.content as string)
    .split(',')
    .map(topic => topic.trim().toLowerCase())
    .filter(topic => topic.length > 0);
}

export const GET = async (req: Request) => {
  try {
    console.log('Starting finance news fetch...');
    
    // Fetch articles from multiple sources
    const searchPromises = new Array(financialSources.length)
      .fill(0)
      .map(async (_, i) => {
        const source = financialSources[i];
        // Use a single topic for more focused results
        const topic = topics[0];
        const query = `site:${source} ${topic}`;
        
        console.log(`Fetching from ${source} with topic: ${topic}`);
        try {
          const response = await searchSearxng(query, {
            engines: ['bing news'],
            pageno: 1,
          });
          
          // Get unique articles by URL
          const seenUrls = new Set();
          const uniqueResults = response.results.filter(article => {
            // Normalize URL by removing query parameters and fragments
            const normalizedUrl = new URL(article.url);
            normalizedUrl.search = '';
            normalizedUrl.hash = '';
            const urlKey = normalizedUrl.toString();
            
            if (seenUrls.has(urlKey)) {
              console.log(`Skipping duplicate article URL: ${article.url}`);
              return false;
            }
            seenUrls.add(urlKey);
            return true;
          }).slice(0, 2);

          console.log(`Results from ${source}:`);
          uniqueResults.forEach(article => {
            console.log(`- Title: "${article.title}"`);
            console.log(`  URL: ${article.url}`);
          });
          return uniqueResults;
        } catch (error) {
          console.error(`Error fetching from ${source}:`, error);
          return [];
        }
      });

    const results = await Promise.all(searchPromises);
    const data = results.flat();
    
    console.log(`\nTotal articles fetched: ${data.length}`);

    if (data.length === 0) {
      console.warn('No articles were fetched from any source');
      return Response.json(
        {
          stories: [],
          message: 'No articles found from any source'
        },
        {
          status: 200
        }
      );
    }

    // Map results to include source and ensure content exists
    const articlesWithSource = data.map(article => {
      const url = new URL(article.url);
      // Remove www. from hostname for consistent source matching
      const source = url.hostname.replace(/^www\./, '');
      return {
        ...article,
        source,
        content: article.content || article.title // Fallback to title if no content
      };
    });

    console.log('\nProcessed articles:');
    articlesWithSource.forEach(article => {
      console.log(`- [${article.source}] "${article.title}"`);
      console.log(`  URL: ${article.url}`);
    });

    console.log('\nStarting article grouping and summarization...');

    // Group similar articles
    const groupedArticles = await groupSimilarArticles(articlesWithSource);
    console.log(`Grouping complete. Created ${groupedArticles.length} story groups`);

    return Response.json(
      {
        stories: groupedArticles
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

export async function groupSimilarArticles(articles: NewsArticle[]): Promise<GroupedStory[]> {
  console.log('\n=== STARTING ARTICLE GROUPING PROCESS ===');
  console.log(`Total articles to process: ${articles.length}`);

  // Debug: Log all articles and their sources first
  console.log('\n=== INITIAL ARTICLES ===');
  articles.forEach((article, idx) => {
    console.log(`\nArticle ${idx}:`);
    console.log(`- Source: ${article.source}`);
    console.log(`- Title: "${article.title}"`);
    console.log(`- URL: ${article.url}`);
  });

  // Extract topics for each article
  console.log('\n=== EXTRACTING TOPICS ===');
  const articlesWithTopics = await Promise.all(
    articles.map(async (article, idx) => {
      console.log(`\nExtracting topics for article ${idx}:`);
      console.log(`- Title: "${article.title}"`);
      const topics = await extractTopics(article);
      console.log(`- Extracted topics: ${topics.join(', ')}`);
      return {
        ...article,
        topics
      };
    })
  );

  // Log all articles with their extracted topics
  console.log('\n=== ARTICLES WITH TOPICS ===');
  articlesWithTopics.forEach((article, idx) => {
    console.log(`\nArticle ${idx}:`);
    console.log(`- Source: ${article.source}`);
    console.log(`- Title: "${article.title}"`);
    console.log(`- Topics: ${article.topics.join(', ')}`);
  });

  const groups: GroupedStory[] = [];
  const processedArticles = new Set();

  // Group articles based on shared topics
  console.log('\n=== STARTING TOPIC-BASED GROUPING ===');
  for (let i = 0; i < articlesWithTopics.length; i++) {
    if (processedArticles.has(i)) {
      console.log(`\nSkipping article ${i} as it's already processed`);
      continue;
    }

    const currentArticle = articlesWithTopics[i];
    console.log(`\n=== PROCESSING ARTICLE ${i} ===`);
    console.log(`- Source: ${currentArticle.source}`);
    console.log(`- Title: "${currentArticle.title}"`);
    console.log(`- Topics: ${currentArticle.topics.join(', ')}`);
    
    const similarArticles = [currentArticle];
    const usedSources = new Set([currentArticle.source]);
    const usedUrls = new Set([currentArticle.url]);
    processedArticles.add(i);

    // Find articles with similar topics
    console.log('\nLooking for similar articles...');
    for (let j = i + 1; j < articlesWithTopics.length; j++) {
      if (processedArticles.has(j)) {
        console.log(`\nSkipping comparison article ${j} as it's already processed`);
        continue;
      }
      
      const comparisonArticle = articlesWithTopics[j];
      
      // Skip if URLs are identical or from same source
      if (usedUrls.has(comparisonArticle.url) || 
          usedSources.has(comparisonArticle.source)) {
        console.log(`\nSkipping article ${j}:`);
        console.log(`- Reason: ${usedUrls.has(comparisonArticle.url) ? 'Duplicate URL' : 'Same source'}`);
        console.log(`- Source: ${comparisonArticle.source}`);
        console.log(`- Title: "${comparisonArticle.title}"`);
        continue;
      }

      // Check for topic overlap
      const sharedTopics = currentArticle.topics.filter(topic => 
        comparisonArticle.topics.includes(topic)
      );
      
      console.log(`\nComparing with article ${j}:`);
      console.log(`- Source: ${comparisonArticle.source}`);
      console.log(`- Title: "${comparisonArticle.title}"`);
      console.log(`- Topics: ${comparisonArticle.topics.join(', ')}`);
      console.log(`- Shared topics: ${sharedTopics.join(', ') || 'None'}`);
      
      if (sharedTopics.length > 0) {
        console.log(`\nAdding article ${j} to group:`);
        console.log(`- Shared topics: ${sharedTopics.join(', ')}`);
        similarArticles.push(comparisonArticle);
        usedSources.add(comparisonArticle.source);
        usedUrls.add(comparisonArticle.url);
        processedArticles.add(j);
      } else {
        console.log(`\nSkipping article ${j} - no shared topics`);
      }
    }

    // Only create a group if we have articles from different sources
    if (similarArticles.length > 1 && usedSources.size > 1) {
      console.log(`\n=== CREATING STORY GROUP ===`);
      console.log(`Number of articles in group: ${similarArticles.length}`);
      console.log(`Number of unique sources: ${usedSources.size}`);
      console.log('\nArticles in group:');
      similarArticles.forEach(article => {
        console.log(`\n- [${article.source}] "${article.title}"`);
        console.log(`  URL: ${article.url}`);
        console.log(`  Topics: ${article.topics.join(', ')}`);
      });
      
      // Generate summary and key points using LLM
      console.log('\nGenerating summary for group...');
      const summary = await generateSummary(similarArticles);
      console.log('Summary generated:', summary);

      console.log('\nExtracting key points...');
      const keyPoints = await extractKeyPoints(similarArticles);
      console.log('Key points extracted:', keyPoints);
      
      groups.push({
        mainTitle: getMostRepresentativeTitle(similarArticles),
        summary,
        keyPoints,
        articles: similarArticles,
        bias: calculateBias(similarArticles)
      });
      console.log('\nGroup processed successfully');
    } else {
      console.log(`\nSkipping group creation:`);
      console.log(`- Number of articles: ${similarArticles.length}`);
      console.log(`- Number of unique sources: ${usedSources.size}`);
      console.log(`- Sources: ${[...usedSources].join(', ')}`);
    }
  }

  console.log(`\n=== ARTICLE GROUPING COMPLETE ===`);
  console.log(`Created ${groups.length} story groups`);
  return groups;
}