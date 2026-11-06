import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ecqhgdpxlrnnfgswxbro.supabase.co';
const supabaseAnonKey = 'sb_publishable_2NMlI-TV8Eb1aMjI_r7ZFQ_w6j0uJo-';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function check() {
  const { data: lessons, error: errL } = await supabase.from('lessons').select('*').eq('id', 'lexam_1793549530485_362iw');
  console.log('Lesson:', lessons, errL);

  const { data: questions, error: errQ } = await supabase.from('exam_questions').select('*').eq('lesson_id', 'lexam_1793549530485_362iw');
  console.log('Questions count:', questions ? questions.length : 0, errQ);
  if (questions && questions.length > 0) {
    console.log('First question:', questions[0]);
  }
}

check();
