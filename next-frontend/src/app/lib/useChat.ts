"use client";

import { useRef, useEffect, useCallback } from "react";
import type { KeyboardEvent } from "react";
import { useSelector, useDispatch } from "react-redux";
import { Temporal } from "@js-temporal/polyfill";
import type { RootState, AppDispatch } from "@/store/store";
import {
  setInputText,
  setIsLoading,
  setShowMap,
  addMessage,
  setPlaces,
  setMobileView,
  setSelectedDistrict,
} from "@/store/chatSlice";
import { requestChat } from "@/app/lib/api";
import { isLocationMessage } from "@/app/lib/chat";

export default function useChat() {
  const dispatch = useDispatch<AppDispatch>();
  const { messages, inputText, isLoading, showMap, places, mobileView, selectedDistrict } =
    useSelector((state: RootState) => state.chat);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (showMap)
      dispatch(setMobileView("map"));
  }, [showMap, dispatch]);

  const handleSend = useCallback(async () => {
    if (!inputText.trim())
      return;
    const userQuery = inputText;
    const userMsgId = Temporal.Now.instant().epochMilliseconds;

    dispatch(addMessage({ id: userMsgId, text: userQuery, sender: "user" }));
    dispatch(setInputText(""));
    dispatch(setIsLoading(true));

    const isLocationQuery = isLocationMessage(userQuery);

    dispatch(setShowMap(isLocationQuery));

    try {
      const data = await requestChat(`[${selectedDistrict}] ${userQuery}`);
      const aiMsgId = Temporal.Now.instant().epochMilliseconds;

      dispatch(addMessage({ id: aiMsgId, text: data.reply, sender: "ai" }));

      if (typeof data.show_map === "boolean") {
        dispatch(setShowMap(data.show_map || isLocationQuery));
      }
      if (Array.isArray(data.places)) {
        dispatch(setPlaces(data.places));
      }
    } catch (error) {
      console.error("통신에러: ", error);
      const errorMsgId = Temporal.Now.instant().epochMilliseconds;
      dispatch(
        addMessage({ id: errorMsgId, text: "백엔드 서버와 연결할 수 없습니다", sender: "ai" })
      );
    } finally {
      dispatch(setIsLoading(false));
    }
  }, [inputText, dispatch, selectedDistrict]);

  const handleKeyPress = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !isLoading) {
        handleSend();
      }
    },
    [handleSend, isLoading]
  );

  return {
    messages,
    inputText,
    isLoading,
    showMap,
    places,
    mobileView,
    selectedDistrict,
    messagesEndRef,
    handleSend,
    handleKeyPress,
    handleInputChange: (text: string) => dispatch(setInputText(text)),
    handleSelectDistrict: (district: string) => dispatch(setSelectedDistrict(district)),
    handleCloseMap: () => dispatch(setShowMap(false)),
    handleToggleView: () => dispatch(setMobileView(mobileView === "chat" ? "map" : "chat")),
  };
};
