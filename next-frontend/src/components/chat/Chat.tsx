"use client";

import ChatHeader from "@/components/chat/ChatHeader";
import ChatMessages from "@/components/chat/ChatMessages";
import ChatInput from "@/components/chat/ChatInput";
import ChatPlaces from "@/components/chat/ChatPlaces";
import ChatMobileToggle from "@/components/chat/ChatMobileToggle";
import useChat from "@/app/lib/useChat";

export default function Chat() {
  const {
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
    handleInputChange,
    handleSelectDistrict,
    handleCloseMap,
    handleToggleView,
  } = useChat();

  return (
    <div className="flex justify-center items-center min-h-screen bg-gradient-to-br from-[#0a0e17] via-[#111827] to-[#0d111a] p-0 sm:p-6 font-sans text-slate-200">
      <div className="w-full h-screen sm:h-[90vh] bg-[#131b2e]/70 backdrop-blur-2xl shadow-2xl rounded-none sm:rounded-2xl flex flex-col overflow-hidden max-w-[1400px] border border-white/10 ring-1 ring-white/5">
        <ChatHeader
        selectedDistrict={selectedDistrict}
        showMap={showMap}
        onSelectDistrict={handleSelectDistrict}/>

        <div className="flex-1 flex flex-col sm:flex-row overflow-hidden relative">
          <div
          className={`flex-1 flex flex-col h-full overflow-hidden bg-[#0f172a]/50 backdrop-blur-sm transition-all duration-300 ${
            showMap ? "sm:w-1/2 sm:border-r sm:border-white/5" : "w-full"
          } ${mobileView === "map" && showMap ? "hidden sm:flex" : "flex"}`}>
            <ChatMessages
            messages={messages}
            isLoading={isLoading}
            messagesEndRef={messagesEndRef}/>
            <ChatInput
            inputText={inputText}
            isLoading={isLoading}
            selectedDistrict={selectedDistrict}
            onInputChange={handleInputChange}
            onKeyPress={handleKeyPress}
            onSend={handleSend}/>
          </div>

          {showMap && (
            <ChatPlaces
            showMap={showMap}
            mobileView={mobileView}
            selectedDistrict={selectedDistrict}
            places={places}
            onClose={handleCloseMap}/>
          )}
        </div>
      </div>

      {showMap && (
        <ChatMobileToggle
        mobileView={mobileView}
        messageCount={messages.length}
        onToggle={handleToggleView}/>
      )}
    </div>
  );
};
