import { Document } from '@langchain/core/documents';
import { OpenAIEmbeddings } from '@langchain/openai';
import { ChatOpenAI } from '@langchain/openai';
import computeSimilarity from '@/lib/utils/computeSimilarity';
import prompts from '@/lib/prompts';
import { getOpenaiApiKey } from '@/lib/config';

export interface GroupedStory {
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

export interface NewsArticle {
  title: string;
  content: string;
  url: string;
  thumbnail?: string;
  source: string;
  publishDate?: string;
  topics?: string[];
}

// Map of news sources to their bias ratings
const sourceBiasMap: Record<string, 'left' | 'center' | 'right'> = {
  'reuters.com': 'center',
  'bloomberg.com': 'center',
  'wsj.com': 'right',
  'ft.com': 'center',
  'cnbc.com': 'center',
  'foxbusiness.com': 'right',
  'marketwatch.com': 'center',
  'businessinsider.com': 'left',
  'forbes.com': 'center',
  'thestreet.com': 'center'
};

export async function generateSummary(articles: NewsArticle[]): Promise<string> {
  console.log('Starting summary generation...');
  const openaiApiKey = getOpenaiApiKey();
  if (!openaiApiKey) {
    throw new Error('OpenAI API key not found in config.toml');
  }

  const llm = new ChatOpenAI({ 
    openAIApiKey: openaiApiKey,
    temperature: 0 
  });
  
  console.log('Sending request to OpenAI for summary...');
  const result = await llm.invoke(
    prompts.financeNewsSummaryPrompt.replace(
      '{context}',
      articles.map(a => `${a.title}\n${a.content}`).join('\n\n')
    ).replace(
      '{date}',
      new Date().toISOString()
    )
  );
  
  console.log('Summary generation complete');
  return result.content as string;
}

export async function extractKeyPoints(articles: NewsArticle[]): Promise<string[]> {
  console.log('Starting key points extraction...');
  const openaiApiKey = getOpenaiApiKey();
  if (!openaiApiKey) {
    throw new Error('OpenAI API key not found in config.toml');
  }

  const llm = new ChatOpenAI({ 
    openAIApiKey: openaiApiKey,
    temperature: 0 
  });
  
  console.log('Sending request to OpenAI for key points...');
  const result = await llm.invoke(
    prompts.financeNewsKeyPointsPrompt.replace(
      '{context}',
      articles.map(a => `${a.title}\n${a.content}`).join('\n\n')
    )
  );
  
  // Split the content into lines and extract bullet points
  const keyPoints = (result.content as string)
    .split('\n')
    .filter(line => line.trim().startsWith('•') || line.trim().startsWith('-'))
    .map(line => line.trim().replace(/^[•-]\s*/, ''));
  
  console.log('Key points extraction complete');
  return keyPoints;
}

export function getMostRepresentativeTitle(articles: NewsArticle[]): string {
  // Get the longest title as it's likely to be most descriptive
  return articles.reduce((longest, article) => 
    article.title.length > longest.length ? article.title : longest
  , articles[0].title);
}

export function calculateBias(articles: NewsArticle[]): { left: number; center: number; right: number } {
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
  const topics = (result.content as string)
    .split(',')
    .map(topic => topic.trim().toLowerCase())
    .filter(topic => topic.length > 0);
  
  console.log('Extracted topics:', topics);
  return topics;
}

export async function groupSimilarArticles(articles: NewsArticle[]): Promise<GroupedStory[]> {
  console.log('Starting article grouping process...');
  const openaiApiKey = getOpenaiApiKey();
  if (!openaiApiKey) {
    throw new Error('OpenAI API key not found in config.toml');
  }

  // Debug: Log all articles and their sources first
  console.log('All articles before grouping:');
  articles.forEach((article, idx) => {
    console.log(`${idx}: [${article.source}] "${article.title}" URL: ${article.url}`);
  });

  // Extract topics for each article
  console.log('Extracting topics from articles...');
  const articlesWithTopics = await Promise.all(
    articles.map(async (article) => ({
      ...article,
      topics: await extractTopics(article)
    }))
  );

  const groups: GroupedStory[] = [];
  const processedArticles = new Set();

  // Group articles based on shared topics
  console.log('Starting topic-based grouping...');
  for (let i = 0; i < articlesWithTopics.length; i++) {
    if (processedArticles.has(i)) {
      console.log(`Skipping article ${i} as it's already processed`);
      continue;
    }

    const currentArticle = articlesWithTopics[i];
    console.log(`\nProcessing article ${i}: [${currentArticle.source}] "${currentArticle.title}"`);
    console.log('Topics:', currentArticle.topics);
    
    const similarArticles = [currentArticle];
    const usedSources = new Set([currentArticle.source]);
    const usedUrls = new Set([currentArticle.url]);
    processedArticles.add(i);

    // Find articles with similar topics
    for (let j = i + 1; j < articlesWithTopics.length; j++) {
      if (processedArticles.has(j)) {
        console.log(`Skipping comparison article ${j} as it's already processed`);
        continue;
      }
      
      const comparisonArticle = articlesWithTopics[j];
      
      // Skip if URLs are identical or from same source
      if (usedUrls.has(comparisonArticle.url) || 
          usedSources.has(comparisonArticle.source)) {
        console.log(`Skipping article ${j} - duplicate URL or source`);
        continue;
      }

      // Check for topic overlap
      const sharedTopics = currentArticle.topics.filter(topic => 
        comparisonArticle.topics.includes(topic)
      );
      
      console.log(`Comparing with article ${j}:`);
      console.log(`- Source: ${comparisonArticle.source}`);
      console.log(`- Title: "${comparisonArticle.title}"`);
      console.log(`- Topics: ${comparisonArticle.topics.join(', ')}`);
      console.log(`- Shared topics: ${sharedTopics.join(', ')}`);
      
      if (sharedTopics.length > 0) {
        console.log(`Adding article ${j} to group (shared topics: ${sharedTopics.join(', ')})`);
        similarArticles.push(comparisonArticle);
        usedSources.add(comparisonArticle.source);
        usedUrls.add(comparisonArticle.url);
        processedArticles.add(j);
      } else {
        console.log(`Skipping article ${j} - no shared topics`);
      }
    }

    // Only create a group if we have articles from different sources
    if (similarArticles.length > 1 && usedSources.size > 1) {
      console.log(`\nFound group of ${similarArticles.length} similar articles from ${usedSources.size} different sources:`);
      similarArticles.forEach(article => {
        console.log(`- [${article.source}] "${article.title}"`);
        console.log(`  URL: ${article.url}`);
        console.log(`  Topics: ${article.topics.join(', ')}`);
      });
      
      // Generate summary and key points using LLM
      console.log('Generating summary for group...');
      const summary = await generateSummary(similarArticles);
      console.log('Summary generated:', summary);

      console.log('Extracting key points...');
      const keyPoints = await extractKeyPoints(similarArticles);
      console.log('Key points extracted:', keyPoints);
      
      groups.push({
        mainTitle: getMostRepresentativeTitle(similarArticles),
        summary,
        keyPoints,
        articles: similarArticles,
        bias: calculateBias(similarArticles)
      });
      console.log('Group processed successfully');
    } else {
      console.log(`\nSkipping group creation:`);
      console.log(`- Number of articles: ${similarArticles.length}`);
      console.log(`- Number of unique sources: ${usedSources.size}`);
      console.log(`- Sources: ${[...usedSources].join(', ')}`);
    }
  }

  console.log(`\nArticle grouping complete. Created ${groups.length} story groups`);
  return groups;
}