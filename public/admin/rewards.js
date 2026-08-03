(function() {
  var _modalData = null;
  var _modalBatchId = null;

  function _pwd() {
    var el = document.getElementById('rewards-password');
    return el ? el.value : '';
  }

  document.addEventListener('click', function(e) {
    var target = e.target.closest('[data-action]');
    if (!target) return;
    var action = target.getAttribute('data-action');
    if (action === 'previewResend') {
      previewResend(Number(target.getAttribute('data-batch-id')), target);
    } else if (action === 'modalSelectAll') {
      modalSelectAll(true);
    } else if (action === 'modalDeselectAll') {
      modalSelectAll(false);
    } else if (action === 'closeResendModal') {
      closeResendModal();
    } else if (action === 'submitResend') {
      submitResend();
    }
  });

  document.addEventListener('input', function(e) {
    if (e.target.id === 'modal-filter') renderModalList();
  });

  document.addEventListener('change', function(e) {
    if (e.target.classList.contains('modal-char-cb')) updateModalCount();
  });

  function previewResend(batchId, btn) {
    btn.disabled = true;
    btn.textContent = 'Loading...';
    fetch('/api/game/rewards/resend-preview?batchId=' + batchId, {
      headers: { 'X-Admin-Password': _pwd() }
    })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        btn.disabled = false;
        btn.textContent = 'Preview';
        if (data.error) { alert('Error: ' + data.error); return; }
        if (!data.recipients || !data.recipients.length) { alert('No eligible characters for this batch.'); return; }
        _modalBatchId = batchId;
        _modalData = data.recipients;
        document.getElementById('modal-title').textContent = 'Resend: ' + (data.subject || 'Untitled');
        document.getElementById('modal-subject').textContent = 'Scope: ' + data.scope + ' \u2014 ' + data.recipients.length + ' eligible';
        renderModalList();
        document.getElementById('resend-modal').style.display = 'flex';
      })
      .catch(function(e) { btn.disabled = false; btn.textContent = 'Preview'; alert('Error: ' + e.message); });
  }

  function renderModalList() {
    var list = document.getElementById('modal-list');
    var filter = (document.getElementById('modal-filter').value || '').toLowerCase();
    var html = '';
    for (var i = 0; i < _modalData.length; i++) {
      var r = _modalData[i];
      var match = !filter || (r.name && r.name.toLowerCase().indexOf(filter) !== -1) || (r.class && r.class.toLowerCase().indexOf(filter) !== -1);
      if (!match) continue;
      html += '<label style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;cursor:pointer;background:rgba(255,255,255,0.03);margin-bottom:4px">' +
        '<input type="checkbox" class="modal-char-cb" value="' + r.id + '" checked style="width:16px;height:16px;accent-color:#2ecc71;flex-shrink:0">' +
        '<span style="flex:1"><strong>' + escHtml(r.name || '?') + '</strong> <span style="color:#94a3b8;font-size:0.8rem">Lv.' + (r.level || '?') + ' ' + escHtml(r.class || '') + '</span></span>' +
        '<span style="color:#6a6a70;font-size:0.75rem">#' + r.id + '</span>' +
      '</label>';
    }
    list.innerHTML = html || '<p style="color:#6a6a70;text-align:center;padding:20px">No matches</p>';
    updateModalCount();
  }

  function updateModalCount() {
    var total = _modalData ? _modalData.length : 0;
    var checked = document.querySelectorAll('.modal-char-cb:checked').length;
    document.getElementById('modal-count').textContent = checked + ' of ' + total + ' selected';
  }

  function modalSelectAll(select) {
    var cbs = document.querySelectorAll('.modal-char-cb');
    for (var i = 0; i < cbs.length; i++) cbs[i].checked = select;
    updateModalCount();
  }

  function closeResendModal() {
    document.getElementById('resend-modal').style.display = 'none';
  }

  function submitResend() {
    var cbs = document.querySelectorAll('.modal-char-cb:checked');
    if (!cbs.length) { alert('Select at least one character.'); return; }
    var ids = [];
    for (var i = 0; i < cbs.length; i++) ids.push(Number(cbs[i].value));
    var btn = document.getElementById('modal-send-btn');
    btn.disabled = true;
    btn.textContent = 'Sending...';
    fetch('/api/game/rewards/resend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Password': _pwd() },
      body: JSON.stringify({ batchId: _modalBatchId, charIds: ids })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      btn.disabled = false;
      btn.textContent = 'Send to Selected';
      if (data.error) { alert('Error: ' + data.error); return; }
      closeResendModal();
      location.reload();
    })
    .catch(function(e) { btn.disabled = false; btn.textContent = 'Send to Selected'; alert('Error: ' + e.message); });
  }

  function escHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
})();
