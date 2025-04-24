// This script handles URL parameters for Bolt when embedded in an iframe
(function() {
  // Parse URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const prompt = urlParams.get('prompt');
  const autoSubmit = urlParams.get('autoSubmit') === 'true';

  // Function to set the prompt in the textarea when the page is ready
  function setPromptInTextarea() {
    if (!prompt) return;
    
    console.log('Setting prompt from URL parameter:', prompt);
    
    // Try to find the textarea
    const textarea = document.querySelector('textarea');
    if (textarea) {
      // Set the value and dispatch an input event to trigger React's onChange
      textarea.value = prompt;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      
      // If autoSubmit is true, find and click the send button
      if (autoSubmit) {
        setTimeout(() => {
          const sendButton = document.querySelector('button[type="submit"]') || 
                            document.querySelector('button.send-button') ||
                            Array.from(document.querySelectorAll('button')).find(btn => 
                              btn.textContent?.includes('Send') || 
                              btn.innerHTML.includes('send') ||
                              btn.innerHTML.includes('paper-plane')
                            );
          
          if (sendButton) {
            console.log('Auto-submitting prompt');
            sendButton.click();
          }
        }, 1000);
      }
    } else {
      // If textarea not found yet, try again after a short delay
      setTimeout(setPromptInTextarea, 500);
    }
  }

  // Listen for messages from parent window
  window.addEventListener('message', function(event) {
    // Process messages from the parent window
    if (event.data && event.data.type === 'SET_PROMPT') {
      const newPrompt = event.data.prompt;
      console.log('Received SET_PROMPT message:', newPrompt);
      
      // Set the prompt in the textarea
      const textarea = document.querySelector('textarea');
      if (textarea) {
        textarea.value = newPrompt;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
    } else if (event.data && event.data.type === 'SUBMIT_PROMPT') {
      console.log('Received SUBMIT_PROMPT message');
      
      // Find and click the send button
      const sendButton = document.querySelector('button[type="submit"]') || 
                        document.querySelector('button.send-button') ||
                        Array.from(document.querySelectorAll('button')).find(btn => 
                          btn.textContent?.includes('Send') || 
                          btn.innerHTML.includes('send') ||
                          btn.innerHTML.includes('paper-plane')
                        );
      
      if (sendButton) {
        sendButton.click();
      }
    }
  });

  // Notify parent that Bolt is ready
  function notifyParentReady() {
    try {
      window.parent.postMessage({ type: 'BOLT_READY' }, '*');
      console.log('Sent BOLT_READY message to parent');
    } catch (e) {
      console.error('Error sending ready message to parent:', e);
    }
  }

  // Run when DOM is fully loaded
  document.addEventListener('DOMContentLoaded', function() {
    console.log('Bolt iframe-handler loaded');
    
    // Set a timeout to make sure React has rendered the components
    setTimeout(() => {
      setPromptInTextarea();
      notifyParentReady();
    }, 1000);
  });

  // If document is already loaded, run immediately
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(() => {
      setPromptInTextarea();
      notifyParentReady();
    }, 1000);
  }
})();
