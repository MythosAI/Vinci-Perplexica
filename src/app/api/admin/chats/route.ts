import db from '@/lib/db';
import { chats } from '@/lib/db/schema';

export const GET = async (req: Request) => {
  console.log('Admin chats API endpoint hit');
  try {
    // Get all chats without filtering by user
    console.log('Fetching all chats from database...');
    const allChats = await db.query.chats.findMany({
      orderBy: (chats, { desc }) => [desc(chats.createdAt)],
    });
    console.log(`Found ${allChats.length} chats`);

    return Response.json({ chats: allChats }, { status: 200 });
  } catch (err) {
    console.error('Error in getting all chats: ', err);
    return Response.json(
      { message: 'An error has occurred.' },
      { status: 500 },
    );
  }
}; 