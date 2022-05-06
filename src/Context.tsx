import React, { ChangeEvent, createContext, EventHandler, PropsWithChildren, useRef, useState } from "react";
import {io} from "socket.io-client";
import Peer from "peerjs";
import { v4 as uuidV4 } from 'uuid'
import axios from "axios";
import { useSnackbar } from 'notistack';
import { TextFieldProps } from "@mui/material";

interface user {
    userId: string;
    userName: string;
}

const userId = uuidV4();
const URL = {
    HTTP: `${process.env.REACT_APP_HTTP_URL}${process.env.REACT_APP_PATH}`,
    WS: `${process.env.REACT_APP_WS_URL}`
};

let socket = io(`${URL.WS}`, {
    query: {userId: userId},
    path: `${process.env.REACT_APP_PATH}/socket.io`
});
const peer = new Peer(userId, {
    host: `${process.env.REACT_APP_PEER_URL}`,
    port: 8848,
    path: `${process.env.REACT_APP_PATH}/peer`,
    config: {
        'iceServers': [
            {
                urls: process.env.REACT_APP_ICE_SERVER_URL!,
                username: process.env.REACT_APP_ICE_SERVER_USERNAME,
                credential: process.env.REACT_APP_ICE_SERVER_CREDENTIAL
            }
        ]
    }
});

export const socketContext = createContext({});

export const ContextProvider = ({ children }: PropsWithChildren<{}>) => {

    const [localMuted, setLocalMuted] = useState(false);
    const [remoteMuted, setRemoteMuted] = useState(false);
    const [joined, setJoined] = useState(false);
    const [roomId, setRoomId] = useState('');
    const [userList, setUserList] = useState<Array<user>>([]);

    const audioRef = useRef<HTMLAudioElement>(null);

    const { enqueueSnackbar } = useSnackbar();

    const localStream = useRef<MediaStream>();
    const remoteStream = useRef<MediaStream>(new MediaStream());

    const getPermissions = (): Promise<void> => {
        return new Promise((resolve, _reject) => {
            if (!localStream.current) {
                navigator.mediaDevices.getUserMedia({
                    video: false,
                    audio: true
                }).then(stream => {
                    if (localStream != null) {
                        localStream.current = stream;
                    }
                    resolve();
                })
            } else {
                resolve();
            }
        });
    }

    const join = (roomId: string, userName: string): Promise<void> => {
        return new Promise((resolve, _reject) => {
            let errMsg: string = '';
            if (roomId.length === 0) {
                errMsg = '房间号不能为空';
            } else if (roomId.length > 10) {
                errMsg = '房间号过长';
            } else if (userName.length === 0) {
                errMsg = '昵称不能为空';
            } else if (userName.length > 10) {
                errMsg = '昵称过长';
            }

            if (errMsg.length > 0) {
                enqueueSnackbar(errMsg, {
                    variant: 'error',
                    anchorOrigin: {
                        vertical: 'bottom',
                        horizontal: 'center',
                    }
                });
                resolve();
            } else {
                getPermissions().then(() => {
                    axios.post(`${URL.HTTP}/join`, {
                        roomId: roomId,
                        userId: userId,
                        userName: userName
                    }).then(res => {
                        if (res.data.status === 'success') {
                            localStorage.setItem('userName', userName);
                            setRoomId(roomId);
                            getUserList();
                            setJoined(true);
                            startListener();
                            resolve();
                        } else {
                            enqueueSnackbar(res.data.content, {
                                variant: 'error',
                                anchorOrigin: {
                                    vertical: 'bottom',
                                    horizontal: 'center',
                                }
                            });
                            resolve();
                        }
                    })
                })
            }
        })
    }

    const create = (userName: string): Promise<void> => {
        return new Promise((resolve, _reject) => {
            let errMsg: string = '';
            if (userName.length === 0) {
                errMsg = '昵称不能为空';
            } else if (userName.length > 10) {
                errMsg = '昵称过长';
            }

            if (errMsg.length > 0) {
                enqueueSnackbar(errMsg, {
                    variant: 'error',
                    anchorOrigin: {
                        vertical: 'bottom',
                        horizontal: 'center',
                    }
                });
                resolve();
            } else {
                getPermissions().then(() => {
                    axios.post(`${URL.HTTP}/create`, {
                        userId: userId,
                        userName: userName
                    }).then(res => {
                        if (res.data.status === 'success') {
                            localStorage.setItem('userName', userName);
                            setRoomId(res.data.content);
                            getUserList();
                            setJoined(true);
                            startListener();
                            resolve();
                        }
                    })
                })
            }
        })
    }

    const startListener = (): void => {
        peer.on('call', answer)

        socket.on('user-join', call)

        socket.on('user-leave', userId => {
            console.log(`${userId} has leaved`);
            getUserList();
        })
    }

    const call = (userId: string) => {
        getUserList();
        console.log(`${userId} joined`);
        console.log(`Calling ${userId}`);
        const call = peer.call(userId, localStream.current!);
        call.on('stream', stream => {
            console.log(`call established`);
            stream.getAudioTracks().forEach(track => {
                remoteStream.current.addTrack(track);
                audioRef.current!.srcObject = remoteStream.current;
            })
        })
    }

    const answer = (call: Peer.MediaConnection) => {
        getUserList();
        console.log('call incoming');
        call.answer(localStream.current);
        call.on('stream', stream => {
            console.log("income call established");
            stream.getAudioTracks().forEach(track => {
                remoteStream.current.addTrack(track);
                audioRef.current!.srcObject = remoteStream.current;
            })
        })
    }

    const getUserList = () => {
        setRoomId(roomId => {
            axios.get(`${URL.HTTP}/getUsers`, {
                params: {
                    roomId: roomId
                }
            }).then(res => {
                if (res.data.status === 'success') {
                    setUserList(res.data.content);
                } else {
                    enqueueSnackbar(res.data.content, {
                        variant: 'error',
                        anchorOrigin: {
                            vertical: 'bottom',
                            horizontal: 'center',
                        }
                    });
                }
            })
            return roomId;
        })
    }

    const toggleLocalMute = () => {
        if (localStream.current) {
            localStream.current.getAudioTracks().forEach(track => {
                if (track.enabled) {
                    track.enabled = false;
                    setLocalMuted(true);
                } else {
                    track.enabled = true;
                    setLocalMuted(false);
                }
            });
        }
    }

    const toggleRemoteMute = () => {
        if (remoteMuted) {
            audioRef.current!.muted = false;
            setRemoteMuted(false);
        } else {
            audioRef.current!.muted = true;
            setRemoteMuted(true);
        }
    }

    return (
        <socketContext.Provider value={{
            localMuted,
            remoteMuted,
            joined,
            roomId,
            join,
            create,
            toggleLocalMute,
            toggleRemoteMute,
            audioRef,
            userList
        }}>
            {children}
        </socketContext.Provider>
    )
}
