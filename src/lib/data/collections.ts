import { supabase } from '../supabase';

/** A person's own folders for saved posts (0077). Row-level security makes
 *  every one of these private to the signed-in user. */
export interface PostCollection {
  id: string;
  name: string;
}

export async function fetchMyCollections(): Promise<PostCollection[]> {
  const { data, error } = await supabase.from('empire_collections').select('id, name').order('created_at', { ascending: true });
  if (error) return [];
  return (data ?? []) as PostCollection[];
}

/** The ids of the collections that already contain this post. */
export async function fetchCollectionIdsForPost(postId: string): Promise<string[]> {
  const { data, error } = await supabase.from('empire_collection_posts').select('collection_id').eq('post_id', postId);
  if (error) return [];
  return (data ?? []).map((r: { collection_id: string }) => r.collection_id);
}

export async function createCollection(name: string): Promise<{ collection: PostCollection | null; error: string | null }> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { collection: null, error: 'Not authenticated' };
  const { data, error } = await supabase
    .from('empire_collections')
    .insert({ name: name.trim(), user_id: auth.user.id })
    .select('id, name')
    .single();
  if (error) return { collection: null, error: error.code === '23505' ? 'You already have a collection with that name.' : error.message };
  return { collection: data as PostCollection, error: null };
}

export async function addPostToCollection(collectionId: string, postId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('empire_collection_posts').upsert({ collection_id: collectionId, post_id: postId }, { onConflict: 'collection_id,post_id' });
  return { error: error?.message ?? null };
}

export async function removePostFromCollection(collectionId: string, postId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('empire_collection_posts').delete().eq('collection_id', collectionId).eq('post_id', postId);
  return { error: error?.message ?? null };
}

/** The ids of the posts inside one collection (for filtering the Saved list). */
export async function fetchCollectionPostIds(collectionId: string): Promise<string[]> {
  const { data, error } = await supabase.from('empire_collection_posts').select('post_id').eq('collection_id', collectionId);
  if (error) return [];
  return (data ?? []).map((r: { post_id: string }) => r.post_id);
}
