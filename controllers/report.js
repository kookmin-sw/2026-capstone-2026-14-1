// AI 성장 리포트 페이지 컨트롤러
function getReportPage(req, res) {
  res.render('report/index', {
    title: 'AI 성장 리포트',
    activeTab: 'report',
  });
}

module.exports = { getReportPage };
