// Each brief has a distinct premise and an engine-controlled hiring route.
const briefs = [
  ['Лист согласования','Координатор','Горизонтальная команда. Для самостоятельного решения потребуется подпись каждого из четырёх руководителей.','random'],
  ['Тихий релиз','Специалист','Предыдущий сотрудник вырос внутри команды. Он передаст дела в рабочее время. Вилка окончательная.','fair'],
  ['Контур замещения','Заместитель','На время отпуска коллеги вы замените его целиком. Коллегой считается отдел.','random'],
  ['Архив решений','Эксперт','Нужно восстановить причины принятых решений. Авторы решений будут доступны после восстановления причин.','test'],
  ['Параллельный офис','Специалист','Можно работать из дома. Дом должен находиться в пределах семи минут от переговорной.','ignore'],
  ['Плановый резерв','Ведущий специалист','Ищем человека на будущую позицию. Дату открытия согласуем, как только получим ваше согласие выйти завтра.','closed'],
  ['Четверть ставки','Консультант','Занятость четыре часа в неделю. Конкретные четыре часа распределяются равномерно между рабочими днями.','random'],
  ['Северная смена','Специалист','Дежурства добровольные и оплачиваются отдельно. График покажем до первого интервью.','fair'],
  ['Внутренний конкурс','Старший специалист','Подбор открытый. Просим в сопроводительном письме указать табельный номер.','instant'],
  ['Бюро передачи дел','Руководитель направления','Первой задачей станет найм собственного преемника. Это обязательный пункт адаптации.','big'],
  ['Исходная версия','Специалист','Приложите пример работы под NDA. Соблюдение NDA проверяется на следующем этапе.','mismatch'],
  ['Порог входа','Стажёр','Наставника выделим после испытательного срока. До этого кандидат самостоятельно готовит наставника к наставничеству.','random'],
  ['Среда пилотов','Специалист','Пилот длится две недели. За последние три года команда провела один пилот. Он ещё идёт.','test'],
  ['Пятый квартал','Координатор','Премия за квартал фиксирована. Выбор квартала остаётся за работодателем.','random'],
  ['Ровный график','Специалист','Интервью на сорок минут. Если наш ответ задержится, можно написать напрямую руководителю.','fair'],
  ['Бюро присутствия','Эксперт','Работа асинхронная. Каждый день в девять сверяемся, кто уже начал работать асинхронно.','ignore'],
  ['Карта компетенций','Ведущий специалист','Грейд определяем по матрице. Ведение матрицы станет вашей первой задачей до определения грейда.','test'],
  ['Обратная связь','Консультант','Мы ответим каждому. Для получения ответа необходимо успешно пройти отбор в список получателей обратной связи.','instant']
];
const norm = text => String(text || '').normalize('NFKC').toLocaleLowerCase('ru').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const pendingFeed = new WeakMap();
const nextAttempt = new WeakMap();
const feedKey = s => JSON.stringify([s.role,s.exp]);
function reserve(s) {
  if (s.reserveKey !== feedKey(s)) { s.reserveKey=feedKey(s); s.reserve=[]; }
  return s.reserve ||= [];
}
function novel(j, seen) {
  return j && ['title','company','desc','salary'].every(k=>typeof j[k]==='string' && norm(j[k])) && !seen.some(x=>norm(j.desc)===norm(x.desc) || (norm(j.company)===norm(x.company) && norm(j.title)===norm(x.title)));
}
function prepareFeed(s) {
  const buffer=reserve(s), key=feedKey(s);
  if (!s.name || s.ending || buffer.length || Date.now()<(nextAttempt.get(s)||0)) return;
  if (pendingFeed.has(s)) return pendingFeed.get(s);
  const run=(async()=>{
    try {
      const data=await generate('jobs',{seen:s.jobs.slice(-24).map(j=>`${j.title} / ${j.company}`)});
      if (g!==s || s.ending || feedKey(s)!==key) return;
      for (const j of (Array.isArray(data?.jobs)?data.jobs:[]).slice(0,3)) {
        if(novel(j,[...s.jobs,...buffer])) buffer.push({...j,type:'random'});
      }
      if (!buffer.length) nextAttempt.set(s,Date.now()+(data?.mode==='demo'?300000:30000));
      persist();
    } finally { pendingFeed.delete(s); }
  })();
  pendingFeed.set(s,run); return run;
}
function takePage(s) {
  const buffer=reserve(s), page=[];
  const take=j=>{if(novel(j,[...s.jobs,...page]))page.push(j)};
  while(buffer.length && page.length<3) take(buffer.shift());
  const deck=briefs.filter(b=>!s.jobs.some(j=>j.desc===b[2]));
  while(deck.length && page.length<3){
    const [company,level,desc,type]=deck.splice(Math.floor(Math.random()*deck.length),1)[0];
    const mode=type==='fair'?'Удалённо':pick(['Офис','Гибрид','Удалённо']);
    take({title:`${s.role || 'IT-специалист'} · ${level}`,company,desc,type,mode,exp:s.exp||'От 1 года',salary:Math.max(35000,Math.round(s.want*(type==='fair'?1:.7)/1000)*1000).toLocaleString('ru')+' ₽'});
  }
  for (const j of page) s.jobs.push({...j,id:s.jobs.length,people:Math.floor(30+Math.random()*900)});
  return page.length;
}

// Match roles by occupation (not by incidental words in a job description).
const roleTerms={
  'Frontend Developer':['frontend','front end','фронтенд'], 'Backend Developer':['backend','back end','бэкенд','бекенд'],
  'Fullstack Developer':['fullstack','full stack','фулстек'], 'Маркетолог':['маркетолог','маркетинг','marketing'],
  'SMM Manager':['smm','смм'], 'UX/UI Designer':['designer','дизайнер','ux ui'], 'QA Engineer':['qa','тестировщик'],
  'DevOps Engineer':['devops','девопс'], 'Project Manager':['project manager','менеджер проектов'],
  'Product Manager':['product manager','продакт'], 'Data Analyst':['data analyst','аналитик данных'],
  'Creative Producer':['creative producer','креативный продюсер'], 'Видеомонтажёр':['видеомонтажер','video editor']
};
const searchText=value=>norm(value).replaceAll('ё','е');
function occupations(j){
  const title=' '+searchText(j.title)+' ';
  return Object.entries(roleTerms).filter(([,terms])=>terms.some(t=>title.includes(' '+t+' '))).map(([role])=>role);
}
function matchingJobs(s,role,query,scope,noIg){
  const words=searchText(query).split(' ').filter(Boolean);
  return s.jobs.filter(j=>{
    if(s.hidden.includes(j.id)||(noIg&&j.type==='ig')||(scope==='Избранное'&&!s.saved.includes(j.id))||(scope==='Удалённо'&&j.mode!=='Удалённо'))return false;
    const roles=occupations(j);
    if(role&&!roles.includes(role)&&!(' '+searchText(j.title)+' ').includes(' '+searchText(role)+' '))return false;
    const text=searchText([j.title,j.company,j.desc,j.duties,j.requirements,j.conditions,...roles.flatMap(r=>[r,...roleTerms[r]])].join(' '));
    return words.every(w=>text.includes(w));
  });
}
