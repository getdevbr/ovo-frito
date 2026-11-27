(function () {
  'use strict';

  function initAutoPoll() {
    const btnSend = document.getElementById('btnSend');
    const urlBar = document.querySelector('.url-bar');
    if (!btnSend || !urlBar || document.getElementById('btnAutoPoll')) return;

    const btnPoll = document.createElement('button');
    btnPoll.id = 'btnAutoPoll';
    btnPoll.type = 'button';
    btnPoll.className = 'btn-secondary';
    btnPoll.style.height = '36px';
    btnPoll.innerHTML = `${window.CDO?.icons?.svg?.('clock') || ''} Auto-Poll`;
    btnPoll.title = 'Repetir requisição até as Assertions passarem';
    btnSend.insertAdjacentElement('afterend', btnPoll);

    let activePoller = null;

    btnPoll.addEventListener('click', async () => {
      if (activePoller) {
        activePoller.stop();
        activePoller = null;
        btnPoll.textContent = '⏱ Auto-Poll';
        return;
      }

      const tab = window.CDO?.app?.getActiveTab?.();
      if (!tab) return;

      btnPoll.textContent = '⏹ Parar Poll';
      activePoller = new window.CDO.poller.Poller({
        intervalMs: 2000,
        maxAttempts: 30,
        send: async () => {
          await window.CDO.app.executeTabRequestObject(tab);
          return tab.response;
        },
        evaluate: () => {
          const results = tab.testResults || [];
          return results.length > 0 && results.every((r) => r.passed);
        }
      });

      activePoller.on('attempt', ({ attempt }) => {
        btnPoll.textContent = `⏹ Poll #${attempt}`;
      });

      await activePoller.start();
      activePoller = null;
      btnPoll.textContent = '⏱ Auto-Poll';
    });

    if (window.CDO?.hookBus) {
      window.CDO.hookBus.on('tab:closed', () => {
        if (activePoller) {
          activePoller.stop();
          activePoller = null;
          btnPoll.textContent = '⏱ Auto-Poll';
        }
      });
    }
  }

  if (window.CDO?.hookBus) {
    window.CDO.hookBus.on('app:ready', initAutoPoll);
  } else {
    window.addEventListener('DOMContentLoaded', initAutoPoll);
  }
})();
