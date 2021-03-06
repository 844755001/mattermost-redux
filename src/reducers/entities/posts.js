// Copyright (c) 2016 Mattermost, Inc. All Rights Reserved.
// See License.txt for license information.

import {PostTypes, UserTypes} from 'action_types';
import {Posts} from 'constants';

function handleReceivedPost(posts = {}, postsByChannel = {}, action) {
    const post = action.data;
    const channelId = post.channel_id;

    const nextPosts = {
        ...posts,
        [post.id]: post
    };

    let nextPostsByChannel = postsByChannel;

    // Only change postsByChannel if the order of the posts needs to change
    if (!postsByChannel[channelId] || postsByChannel[channelId].indexOf(post.id) === -1) {
        // If we don't already have the post, assume it's the most recent one
        const postsInChannel = postsByChannel[channelId] || [];

        nextPostsByChannel = {...postsByChannel};
        nextPostsByChannel[channelId] = [
            post.id,
            ...postsInChannel
        ];
    }

    return {posts: nextPosts, postsByChannel: nextPostsByChannel};
}

function handleReceivedPosts(posts = {}, postsByChannel = {}, action) {
    const newPosts = action.data.posts;
    const channelId = action.channelId;

    const nextPosts = {...posts};
    const nextPostsByChannel = {...postsByChannel};
    const postsInChannel = postsByChannel[channelId] ? [...postsByChannel[channelId]] : [];

    for (const newPost of Object.values(newPosts)) {
        if (newPost.delete_at > 0) {
            continue;
        }

        // Only change the stored post if it's changed since we last received it
        if (!nextPosts[newPost.id] || nextPosts[newPost.id].update_at > newPost.update_at) {
            nextPosts[newPost.id] = newPost;
        }

        if (postsInChannel.indexOf(newPost.id) === -1) {
            // Just add the post id to the end of the order and we'll sort it out later
            postsInChannel.push(newPost.id);
        }
    }

    // Sort to ensure that the most recent posts are first
    postsInChannel.sort((a, b) => {
        if (nextPosts[a].create_at > nextPosts[b].create_at) {
            return -1;
        } else if (nextPosts[a].create_at < nextPosts[b].create_at) {
            return 1;
        }

        return 0;
    });

    nextPostsByChannel[channelId] = postsInChannel;

    return {posts: nextPosts, postsByChannel: nextPostsByChannel};
}

function handlePostDeleted(posts = {}, postsByChannel = {}, action) {
    const post = action.data;

    let nextPosts = posts;

    // We only need to do something if already have the post
    if (posts[post.id]) {
        nextPosts = {...posts};

        nextPosts[post.id] = {
            ...posts[post.id],
            state: Posts.POST_DELETED,
            file_ids: [],
            has_reactions: false
        };

        // No changes to the order until the user actually removes the post
    }

    return {posts: nextPosts, postsByChannel};
}

function handleRemovePost(posts = {}, postsByChannel = {}, action) {
    const post = action.data;
    const channelId = post.channel_id;

    let nextPosts = posts;
    let nextPostsByChannel = postsByChannel;

    // We only need to do something if already have the post
    if (nextPosts[post.id]) {
        nextPosts = {...posts};
        nextPostsByChannel = {...postsByChannel};
        const postsInChannel = postsByChannel[channelId] ? [...postsByChannel[channelId]] : [];

        // Remove the post itself
        Reflect.deleteProperty(nextPosts, post.id);

        const index = postsInChannel.indexOf(post.id);
        if (index !== -1) {
            postsInChannel.splice(index, 1);
        }

        // Remove any of its comments
        for (const id of postsInChannel) {
            if (nextPosts[id].root_id === post.id) {
                Reflect.deleteProperty(nextPosts, id);

                const commentIndex = postsInChannel.indexOf(id);
                if (commentIndex !== -1) {
                    postsInChannel.splice(commentIndex, 1);
                }
            }
        }

        nextPostsByChannel[channelId] = postsInChannel;
    }

    return {posts: nextPosts, postsByChannel: nextPostsByChannel};
}

function handlePosts(posts = {}, postsByChannel = {}, action) {
    switch (action.type) {
    case PostTypes.RECEIVED_POST:
        return handleReceivedPost(posts, postsByChannel, action);
    case PostTypes.RECEIVED_POSTS:
        return handleReceivedPosts(posts, postsByChannel, action);
    case PostTypes.POST_DELETED:
        return handlePostDeleted(posts, postsByChannel, action);
    case PostTypes.REMOVE_POST:
        return handleRemovePost(posts, postsByChannel, action);

    case UserTypes.LOGOUT_SUCCESS:
        return {
            posts: {},
            postsByChannel: {}
        };
    default:
        return {
            posts,
            postsByChannel
        };
    }
}

function selectedPostId(state = '', action) {
    switch (action.type) {
    case PostTypes.RECEIVED_POST_SELECTED:
        return action.data;
    case UserTypes.LOGOUT_SUCCESS:
        return '';
    default:
        return state;
    }
}

function currentFocusedPostId(state = '', action) {
    switch (action.type) {
    case UserTypes.LOGOUT_SUCCESS:
        return '';
    default:
        return state;
    }
}

export default function(state = {}, action) {
    const {posts, postsByChannel} = handlePosts(state.posts, state.postsByChannel, action);

    const nextState = {

        // Object mapping post ids to post objects
        posts,

        // Object mapping channel ids to an list of posts ids in that channel with the most recent post first
        postsByChannel,

        // The current selected post
        selectedPostId: selectedPostId(state.selectedPostId, action),

        // The current selected focused post (permalink view)
        currentFocusedPostId: currentFocusedPostId(state.currentFocusedPostId, action)
    };

    if (state.posts === nextState.posts && state.postsByChannel === nextState.postsByChannel &&
        state.selectedPostId === nextState.selectedPostId &&
        state.currentFocusedPostId === nextState.currentFocusedPostId) {
        // None of the children have changed so don't even let the parent object change
        return state;
    }

    return nextState;
}
