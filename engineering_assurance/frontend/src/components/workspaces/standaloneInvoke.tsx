import React, { createContext, useContext } from 'react';

const StandaloneInvokeContext = createContext<boolean>(true);

export const StandaloneInvokeProvider = StandaloneInvokeContext.Provider;

export const useStandaloneInvokeEnabled = () => useContext(StandaloneInvokeContext);
