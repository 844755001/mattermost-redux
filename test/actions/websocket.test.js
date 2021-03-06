// Copyright (c) 2016 Mattermost, Inc. All Rights Reserved.
// See License.txt for license information.

import assert from 'assert';
import * as Actions from 'actions/websocket';
import * as ChannelActions from 'actions/channels';
import * as TeamActions from 'actions/teams';
import * as GeneralActions from 'actions/general';

import {Client, Client4} from 'client';
import configureStore from 'store';
import {General, Posts, RequestStatus} from 'constants';
import TestHelper from 'test/test_helper';

describe('Actions.Websocket', () => {
    let store;
    before(async () => {
        store = configureStore();
        await TestHelper.initBasic(Client, Client4);
        const webSocketConnector = require('ws');
        return await Actions.init(
            'ios',
            null,
            null,
            webSocketConnector
        )(store.dispatch, store.getState);
    });

    after(async () => {
        Actions.close()();
        await TestHelper.basicClient.logout();
        await TestHelper.basicClient4.logout();
    });

    it('WebSocket Connect', () => {
        const ws = store.getState().requests.general.websocket;
        assert.ok(ws.status === RequestStatus.SUCCESS);
    });

    it('Websocket Handle New Post', async () => {
        const client = TestHelper.createClient4();
        const user = await client.createUser(
            TestHelper.fakeUser(),
            null,
            null,
            TestHelper.basicTeam.invite_id
        );
        await client.login(user.email, 'password1');

        await Client4.addToChannel(user.id, TestHelper.basicChannel.id);

        const post = {...TestHelper.fakePost(), channel_id: TestHelper.basicChannel.id};
        await client.createPost(post);

        const entities = store.getState().entities;
        const {posts, postsByChannel} = entities.posts;
        const channelId = TestHelper.basicChannel.id;
        const postId = postsByChannel[channelId][0];

        assert.ok(posts[postId].message.indexOf('Unit Test') > -1);
    });

    it('Websocket Handle Post Edited', async () => {
        let post = {...TestHelper.fakePost(), channel_id: TestHelper.basicChannel.id};
        const client = TestHelper.createClient4();
        const user = await client.createUser(
            TestHelper.fakeUser(),
            null,
            null,
            TestHelper.basicTeam.invite_id
        );

        await Client4.addToChannel(user.id, TestHelper.basicChannel.id);
        await client.login(user.email, 'password1');

        post = await client.createPost(post);
        post.message += ' (edited)';

        await client.updatePost(post);

        store.subscribe(async () => {
            const entities = store.getState().entities;
            const {posts} = entities.posts;
            assert.ok(posts[post.id].message.indexOf('(edited)') > -1);
        });
    });

    it('Websocket Handle Post Deleted', async () => {
        const client = TestHelper.createClient4();
        const user = await client.createUser(
            TestHelper.fakeUser(),
            null,
            null,
            TestHelper.basicTeam.invite_id
        );

        await Client4.addToChannel(user.id, TestHelper.basicChannel.id);
        await client.login(user.email, 'password1');
        let post = TestHelper.fakePost();
        post.channel_id = TestHelper.basicChannel.id;
        post = await client.createPost(post);

        await client.deletePost(post.id);

        store.subscribe(async () => {
            const entities = store.getState().entities;
            const {posts} = entities.posts;
            assert.strictEqual(posts[post.id].state, Posts.POST_DELETED);
        });
    });

    it('WebSocket Leave Team', async () => {
        const client = TestHelper.createClient4();
        const user = await client.createUser(TestHelper.fakeUser());
        await client.login(user.email, 'password1');
        const team = await client.createTeam(TestHelper.fakeTeam());
        const channel = await client.createChannel(TestHelper.fakeChannel(team.id));
        await client.addToTeam(team.id, TestHelper.basicUser.id);
        await client.addToChannel(TestHelper.basicUser.id, channel.id);

        await GeneralActions.setStoreFromLocalData({
            url: Client4.getUrl(),
            token: Client4.getToken()
        })(store.dispatch, store.getState);
        await TeamActions.selectTeam(team)(store.dispatch, store.getState);
        await ChannelActions.selectChannel(channel.id)(store.dispatch, store.getState);
        await client.removeFromTeam(team.id, TestHelper.basicUser.id);

        const {myMembers} = store.getState().entities.teams;
        assert.ifError(myMembers[team.id]);
    }).timeout(3000);

    it('Websocket Handle User Added', async () => {
        const client = TestHelper.createClient4();
        const user = await client.createUser(
            TestHelper.fakeUser(),
            null,
            null,
            TestHelper.basicTeam.invite_id
        );

        await TeamActions.selectTeam(TestHelper.basicTeam)(store.dispatch, store.getState);

        await ChannelActions.addChannelMember(
            TestHelper.basicChannel.id,
            user.id
        )(store.dispatch, store.getState);

        const entities = store.getState().entities;
        const profilesInChannel = entities.users.profilesInChannel;
        assert.ok(profilesInChannel[TestHelper.basicChannel.id].has(user.id));
    });

    it('Websocket Handle User Removed', async () => {
        await TeamActions.selectTeam(TestHelper.basicTeam)(store.dispatch, store.getState);

        const user = await TestHelper.basicClient4.createUser(
            TestHelper.fakeUser(),
            null,
            null,
            TestHelper.basicTeam.invite_id
        );

        await ChannelActions.addChannelMember(
            TestHelper.basicChannel.id,
            user.id
        )(store.dispatch, store.getState);

        await ChannelActions.removeChannelMember(
            TestHelper.basicChannel.id,
            user.id
        )(store.dispatch, store.getState);

        const state = store.getState();
        const entities = state.entities;
        const profilesNotInChannel = entities.users.profilesNotInChannel;

        assert.ok(profilesNotInChannel[TestHelper.basicChannel.id].has(user.id));
    });

    it('Websocket Handle User Updated', async () => {
        const client = TestHelper.createClient4();
        const user = await client.createUser(
            TestHelper.fakeUser(),
            null,
            null,
            TestHelper.basicTeam.invite_id
        );

        await client.login(user.email, 'password1');
        await client.updateUser({...user, first_name: 'tester4'});

        store.subscribe(() => {
            const state = store.getState();
            const entities = state.entities;
            const profiles = entities.users.profiles;

            assert.strictEqual(profiles[user.id].first_name, 'tester4');
        });
    });

    it('Websocket Handle Channel Created', (done) => {
        async function test() {
            await TeamActions.selectTeam(TestHelper.basicTeam)(store.dispatch, store.getState);
            const channel = await Client4.createChannel(TestHelper.fakeChannel(TestHelper.basicTeam.id));

            setTimeout(() => {
                const state = store.getState();
                const entities = state.entities;
                const {channels} = entities.channels;

                assert.ok(channels[channel.id]);
                done();
            }, 1000);
        }

        test();
    });

    it('Websocket Handle Channel Deleted', (done) => {
        async function test() {
            await TeamActions.selectTeam(TestHelper.basicTeam)(store.dispatch, store.getState);
            await ChannelActions.fetchMyChannelsAndMembers(TestHelper.basicTeam.id)(store.dispatch, store.getState);
            await ChannelActions.selectChannel(TestHelper.basicChannel.id)(store.dispatch, store.getState);
            await Client4.deleteChannel(
                TestHelper.basicChannel.id
            );

            setTimeout(() => {
                const state = store.getState();
                const entities = state.entities;
                const {channels, currentChannelId} = entities.channels;

                assert.ok(channels[currentChannelId].name === General.DEFAULT_CHANNEL);
                done();
            }, 500);
        }

        test();
    });

    it('Websocket Handle Direct Channel', (done) => {
        async function test() {
            const client = TestHelper.createClient4();
            const user = await client.createUser(
                TestHelper.fakeUser(),
                null,
                null,
                TestHelper.basicTeam.invite_id
            );

            await client.login(user.email, 'password1');
            await TeamActions.selectTeam(TestHelper.basicTeam)(store.dispatch, store.getState);

            setTimeout(() => {
                const entities = store.getState().entities;
                const {channels} = entities.channels;
                assert.ok(Object.keys(channels).length);
                done();
            }, 500);

            await client.createDirectChannel([user.id, TestHelper.basicUser.id]);
        }

        test();
    });
});
