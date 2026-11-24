using System;

class Program
{
    static void Main()
    {
        char c = 'a';
        c++;
        Console.WriteLine(c);
        Console.WriteLine(c + 1);
        Console.WriteLine((char)(c + 1));
        Console.WriteLine((int)c);
        Console.WriteLine(char.IsDigit('5') + " " + char.IsLetter('x') + " " + char.ToUpper('q') + " " + char.IsUpper('Q') + " " + char.IsWhiteSpace(' '));
        Console.WriteLine('a' < 'b');
        Console.WriteLine('z' - 'a');
        char d = 'A';
        d = (char)(d + 25);
        Console.WriteLine(d);
        Console.WriteLine('\n' == 10);
        Console.WriteLine('\'' + "" + '\\' + '\t' + '|');
        int digit = '7' - '0';
        Console.WriteLine(digit * 2);
    }
}
