using System;

class Program
{
    static bool IsAdult(int age)
    {
        if (age >= 18)
        {
            return true;
        }
    }
    static void Main() { Console.WriteLine(IsAdult(3)); }
}
