// Copyright (c) 2016 Mattermost, Inc. All Rights Reserved.
// See License.txt for license information.

import {batchActions} from 'redux-batched-actions';

import {Client, Client4} from 'client';
import {bindClientFunc, FormattedError} from './helpers.js';
import {GeneralTypes} from 'action_types';
import {getMyChannelMembers} from './channels';
import {getLogErrorAction} from './errors';
import {loadMe} from './users';

export function getPing() {
    return async (dispatch, getState) => {
        dispatch({type: GeneralTypes.PING_REQUEST}, getState);

        const pingError = new FormattedError(
            'mobile.server_ping_failed',
            'Cannot connect to the server. Please check your server URL and internet connection.'
        );
        try {
            await Client4.getPing();
        } catch (error) {
            dispatch(batchActions([
                {type: GeneralTypes.PING_FAILURE, error: pingError},
                getLogErrorAction(error)
            ]), getState);
            return;
        }

        dispatch({type: GeneralTypes.PING_SUCCESS}, getState);
    };
}

export function resetPing() {
    return async (dispatch, getState) => {
        dispatch({type: GeneralTypes.PING_RESET}, getState);
    };
}

export function getClientConfig() {
    return bindClientFunc(
        Client4.getClientConfigOld,
        GeneralTypes.CLIENT_CONFIG_REQUEST,
        [GeneralTypes.CLIENT_CONFIG_RECEIVED, GeneralTypes.CLIENT_CONFIG_SUCCESS],
        GeneralTypes.CLIENT_CONFIG_FAILURE
    );
}

export function getLicenseConfig() {
    return bindClientFunc(
        Client4.getClientLicenseOld,
        GeneralTypes.CLIENT_LICENSE_REQUEST,
        [GeneralTypes.CLIENT_LICENSE_RECEIVED, GeneralTypes.CLIENT_LICENSE_SUCCESS],
        GeneralTypes.CLIENT_LICENSE_FAILURE
    );
}

export function logClientError(message, level = 'ERROR') {
    return bindClientFunc(
        Client.logClientError,
        GeneralTypes.LOG_CLIENT_ERROR_REQUEST,
        GeneralTypes.LOG_CLIENT_ERROR_SUCCESS,
        GeneralTypes.LOG_CLIENT_ERROR_FAILURE,
        message,
        level
    );
}

export function setAppState(state) {
    return async (dispatch, getState) => {
        dispatch({type: GeneralTypes.RECEIVED_APP_STATE, data: state}, getState);

        if (state) {
            const {currentTeamId} = getState().entities.teams;
            if (currentTeamId) {
                getMyChannelMembers(currentTeamId)(dispatch, getState);
            }
        }
    };
}

export function setDeviceToken(token) {
    return async (dispatch, getState) => {
        dispatch({type: GeneralTypes.RECEIVED_APP_DEVICE_TOKEN, data: token}, getState);
    };
}

export function setServerVersion(serverVersion) {
    return async (dispatch, getState) => {
        dispatch({type: GeneralTypes.RECEIVED_SERVER_VERSION, data: serverVersion}, getState);
    };
}

export function setStoreFromLocalData(data) {
    return async (dispatch, getState) => {
        Client.setToken(data.token);
        Client.setUrl(data.url);
        Client4.setToken(data.token);
        Client4.setUrl(data.url);

        return loadMe()(dispatch, getState);
    };
}

export default {
    getPing,
    getClientConfig,
    getLicenseConfig,
    logClientError,
    setAppState,
    setDeviceToken,
    setServerVersion,
    setStoreFromLocalData
};
