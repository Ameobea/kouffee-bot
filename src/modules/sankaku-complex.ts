/**
 * Pulls a random image off of sankaku complex matching the provided tag
 */

import * as R from 'ramda';
import fetch from 'node-fetch';
import Eris from 'eris';
import { CommandResponse } from '..';
import { btoa } from 'src/util';

// Retrieve multiple results at the same time so people rapid-firing requests for a given tag won't have to hit the API every time.
const SearchResultsCache: Map<string, SearchResultImage[]> = new Map();

const buildSearchResultsCacheKey = (encodedTag: string, nsfw: string) => `${encodedTag}-${nsfw}`;

const encodeTag = (tag: string) => encodeURIComponent(tag.replaceAll(' ', '_'));

interface AutoCompleteItem {
  id: number;
  name: string;
  name_en: string;
  name_ja: string;
  type: number;
  count: number;
  post_count: number;
  pool_count: number;
}

const buildAutoCompleteURL = (tag: string) =>
  `https://capi-v2.sankakucomplex.com/tags/autosuggestCreating?lang=en&tag=${encodeTag(
    tag
  )}&show_meta=1&target=post`;

const fetchTagAutocomplete = (tag: string) =>
  fetch(buildAutoCompleteURL(encodeTag(tag))).then(async res => {
    if (!res.ok) {
      throw await res.text();
    }
    return (await res.json()) as AutoCompleteItem[];
  });

const buildSearchURL = (encodedTag: string, nsfw: 'yes' | 'no' | 'both') =>
  `https://capi-v2.sankakucomplex.com/posts/keyset?lang=en&default_threshold=1&hide_posts_in_books=in-larger-tags&limit=40&tags=order:random${
    nsfw === 'yes' ? '+rating:e+-male+-rape' : nsfw === 'no' ? '+rating:s' : ''
  }+${encodedTag}`;

interface SearchResultImage {
  id: number;
  rating: string;
  status: string;
  author: Author;
  sample_url: string;
  sample_width: number;
  sample_height: number;
  preview_url: string;
  preview_width: number;
  preview_height: number;
  file_url: string | null;
  width: number;
  height: number;
  file_size: number;
  file_type: string;
  created_at: CreatedAt;
  has_children: boolean;
  has_comments: boolean;
  has_notes: boolean;
  is_favorited: boolean;
  user_vote: any;
  md5: string;
  parent_id: any;
  change: number;
  fav_count: number;
  recommended_posts: string;
  recommended_score: number;
  vote_count: number;
  total_score: number;
  comment_count: any;
  source: string;
  in_visible_pool: boolean;
  is_premium: boolean;
  redirect_to_signup: boolean;
  sequence: any;
  tags: Tag[];
}

export interface SearchResult {
  meta: {
    next: string;
    prev: any;
  };
  data: SearchResultImage[];
}

export interface Author {
  id: number;
  name: string;
  avatar: string;
  avatar_rating: string;
}

export interface CreatedAt {
  json_class: string;
  s: number;
  n: number;
}

export interface Tag {
  id: number;
  name_en: string;
  name_ja?: string;
  type: number;
  count: number;
  post_count: number;
  pool_count: number;
  locale: string;
  rating?: string;
  name: string;
}

const doSearch = (tag: string, nsfw: 'yes' | 'no' | 'both') =>
  fetch(buildSearchURL(tag, nsfw)).then(async res => {
    if (!res.ok) {
      throw await res.text();
    }
    return (await res.json()) as SearchResult;
  });

export const getSankakuComplexImage = async (
  tag: string,
  nsfw: 'yes' | 'no' | 'both'
): Promise<SearchResultImage | string> => {
  // Hit autocomplete API to get a proper tag name
  const autoCompletedTag = (await fetchTagAutocomplete(tag))[0];
  if (!autoCompletedTag) {
    console.log('autocomplete failed');
    return `Nothing found for the tag "${tag}"`;
  }
  const autoCompleteTagName = encodeTag(autoCompletedTag.name);

  // First check our cache to see if we already have search results
  const cacheKey = buildSearchResultsCacheKey(autoCompleteTagName, nsfw);
  const cachedResults = SearchResultsCache.get(cacheKey);
  if (cachedResults?.length) {
    return cachedResults.pop()!;
  }

  try {
    const res = await doSearch(autoCompleteTagName, nsfw);
    if (res.data.length === 0) {
      console.log('Empty response for tag provided by autocomplete: ', autoCompleteTagName, {
        searchURL: buildSearchURL(autoCompleteTagName, nsfw),
      });
      return `Nothing found for the tag "${tag}"`;
    }

    const resToReturn = res.data.pop()!;
    SearchResultsCache.set(cacheKey, res.data);
    return resToReturn;
  } catch (err) {
    return `API error: \`${err}\``;
  }
};

const getProxiedImageURL = (imageURL: string, height: number, width: number) =>
  `https://sankaku-proxy.ameo.dev/insecure/fill/${width}/${height}/sm/0/${btoa(imageURL)}.jpg`;

export const getSankakuComplexImageDriver = async (
  msg: Eris.Message,
  forceBothNSFW = false
): Promise<CommandResponse> => {
  let spl = R.tail(msg.content.split(/\s+/g));
  let nsfw: 'yes' | 'no' | 'both' = 'no';
  if (spl[0] === '--nsfw') {
    nsfw = 'yes';
    spl = R.tail(spl);
  }
  if (forceBothNSFW) {
    nsfw = 'both';
  }

  if (R.isEmpty(spl)) {
    return 'Usage: `-sc <--nsfw> <tag>`';
  }

  const tag = spl.join(' ');
  const res = await getSankakuComplexImage(tag, nsfw);
  if (typeof res === 'string') {
    return res;
  }

  if (typeof res.sample_url !== 'string') {
    delete (res as any).tags;
    console.log(res);
    return 'Got bad image URL from Sankaku';
  }

  return getProxiedImageURL(res.sample_url, res.sample_height, res.sample_width);
};
